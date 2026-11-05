import {
  CLAUDE_CLOUD_THREAD_ID_PREFIX,
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  EventId,
  MessageId,
  ProviderDriverKind,
  ThreadId,
  TurnItemId,
  defaultInstanceIdForDriver,
  type OrchestrationProjectShell,
  type OrchestrationV2AppThread,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2TurnItem,
  type ProjectId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Path from "effect/Path";

import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { resolveClaudeHomePath } from "../provider/Drivers/ClaudeHome.ts";
import { forkParked } from "../serverActivation.ts";
import * as ServerSettings from "../serverSettings.ts";

// Internal claude.ai/code endpoints, read from the Claude Code CLI (2.1.318). Undocumented.
const API_BASE = "https://api.anthropic.com/v1/code/sessions";
const IDLE_INTERVAL = Duration.seconds(60);
const BUSY_INTERVAL = Duration.seconds(5);
const SESSION_PAGE_LIMIT = 50;
const EVENT_PAGE_LIMIT = 200;
const EVENT_ID_PREFIX = "claude-cloud";

const CloudSession = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  status: Schema.optional(Schema.String),
  worker_status: Schema.optional(Schema.String),
  environment_kind: Schema.optional(Schema.String),
  created_at: Schema.String,
  last_event_at: Schema.optional(Schema.NullOr(Schema.String)),
  config: Schema.optional(
    Schema.Struct({
      model: Schema.optional(Schema.String),
      sources: Schema.optional(
        Schema.Array(
          Schema.Struct({
            type: Schema.optional(Schema.String),
            url: Schema.optional(Schema.String),
          }),
        ),
      ),
    }),
  ),
});
export type CloudSession = typeof CloudSession.Type;

const CloudSessionPage = Schema.Struct({
  data: Schema.Array(CloudSession),
});

const CloudEvent = Schema.Struct({
  sequence_num: Schema.Union([Schema.String, Schema.Number]),
  created_at: Schema.String,
  payload: Schema.optional(Schema.Unknown),
});
type CloudEvent = typeof CloudEvent.Type;

const CloudEventPage = Schema.Struct({
  data: Schema.Array(CloudEvent),
  next_cursor: Schema.optional(Schema.NullOr(Schema.String)),
});

const ClaudeCredentials = Schema.Struct({
  claudeAiOauth: Schema.Struct({ accessToken: Schema.String }),
});
const ClaudeAccount = Schema.Struct({
  oauthAccount: Schema.optional(
    Schema.Struct({ organizationUuid: Schema.optional(Schema.String) }),
  ),
});

class ClaudeCloudSessionsError extends Schema.TaggedError<ClaudeCloudSessionsError>()(
  "ClaudeCloudSessionsError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}
const isClaudeCloudSessionsError = Schema.is(ClaudeCloudSessionsError);

interface CloudRepository {
  readonly owner: string;
  readonly name: string;
}

interface CloudMessage {
  readonly sequence: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
}

/** "bridge" sessions are Remote Control views of a local session, which T3 already shows. */
export function isMirroredCloudSession(session: CloudSession): boolean {
  return session.environment_kind !== "bridge" && session.status !== "archived";
}

function isCloudSessionBusy(session: CloudSession): boolean {
  return session.worker_status === "running";
}

export function cloudSessionRepository(session: CloudSession): CloudRepository | null {
  for (const source of session.config?.sources ?? []) {
    if (source.type !== "git_repository" || source.url === undefined) continue;
    const match = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(source.url);
    if (match?.[1] && match[2]) {
      return { owner: match[1].toLowerCase(), name: match[2].toLowerCase() };
    }
  }
  return null;
}

export function projectForRepository(
  projects: ReadonlyArray<OrchestrationProjectShell>,
  repository: CloudRepository,
): OrchestrationProjectShell | undefined {
  return projects.find((project) => {
    const identity = project.repositoryIdentity;
    return (
      project.archivedAt == null &&
      identity?.owner?.toLowerCase() === repository.owner &&
      identity.name?.toLowerCase() === repository.name
    );
  });
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((block) =>
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
        ? [(block as { text: string }).text.trim()]
        : [],
    )
    .filter((text) => text.length > 0)
    .join("\n");
}

/** Keeps the visible conversation: user prompts and assistant text, not tool traffic. */
export function cloudMessages(events: ReadonlyArray<CloudEvent>): ReadonlyArray<CloudMessage> {
  return events.flatMap((event) => {
    const payload = event.payload as
      | {
          type?: unknown;
          isSidechain?: unknown;
          isMeta?: unknown;
          parent_tool_use_id?: unknown;
          message?: { content?: unknown };
        }
      | undefined;
    if (payload?.type !== "user" && payload?.type !== "assistant") return [];
    if (payload.isSidechain === true || payload.isMeta === true) return [];
    if (payload.parent_tool_use_id != null) return [];
    const text = textOf(payload.message?.content);
    if (text.length === 0) return [];
    return [
      {
        sequence: String(event.sequence_num),
        role: payload.type,
        text,
        createdAt: event.created_at,
      },
    ];
  });
}

function cloudThreadId(sessionId: string): ThreadId {
  return ThreadId.make(`${CLAUDE_CLOUD_THREAD_ID_PREFIX}${sessionId}`);
}

function messageEvents(
  threadId: ThreadId,
  message: CloudMessage,
  ordinal: number,
): ReadonlyArray<OrchestrationV2DomainEvent> {
  const key = `${threadId}:${message.sequence}`;
  const messageId = MessageId.make(`${EVENT_ID_PREFIX}:message:${key}`);
  const at = DateTime.makeUnsafe(message.createdAt);
  const common = {
    id: TurnItemId.make(`${EVENT_ID_PREFIX}:turn-item:${key}`),
    threadId,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal,
    status: "completed" as const,
    title: null,
    startedAt: at,
    completedAt: at,
    updatedAt: at,
  };
  const turnItem: OrchestrationV2TurnItem =
    message.role === "user"
      ? {
          ...common,
          createdBy: "user",
          creationSource: "server",
          type: "user_message",
          messageId,
          inputIntent: "turn_start",
          text: message.text,
          attachments: [],
        }
      : { ...common, type: "assistant_message", messageId, text: message.text, streaming: false };
  return [
    {
      id: EventId.make(`${EVENT_ID_PREFIX}:message-event:${key}`),
      type: "message.updated",
      threadId,
      occurredAt: at,
      payload: {
        createdBy: message.role === "user" ? "user" : "agent",
        creationSource: "server",
        id: messageId,
        threadId,
        runId: null,
        nodeId: null,
        role: message.role,
        text: message.text,
        attachments: [],
        streaming: false,
        createdAt: at,
        updatedAt: at,
      },
    },
    {
      id: EventId.make(`${EVENT_ID_PREFIX}:turn-item-event:${key}`),
      type: "turn-item.updated",
      threadId,
      occurredAt: at,
      payload: turnItem,
    },
  ];
}

function cloudThreadTitle(session: CloudSession): string {
  const title = session.title?.trim();
  return title ? title : "Cloud session";
}

const make = Effect.gen(function* () {
  const settings = yield* ServerSettings.ServerSettingsService;
  const projects = yield* ProjectService.ProjectService;
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const eventSink = yield* EventSink.EventSinkV2;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

  // The default Claude login; per-instance homes are a later concern.
  const configDir = yield* resolveClaudeHomePath({ homePath: "" });
  // Last event sequence written per session; rebuilt from the projection after a restart.
  const syncedSequence = new Map<string, number>();

  // Read on every request so the CLI stays the only writer and refresher of the token.
  const authHeaders = Effect.gen(function* () {
    const credentials = yield* fileSystem
      .readFileString(path.join(configDir, ".credentials.json"))
      .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(ClaudeCredentials))));
    const account = yield* fileSystem
      .readFileString(path.join(path.dirname(configDir), ".claude.json"))
      .pipe(
        Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(ClaudeAccount))),
        Effect.option,
      );
    const organization = Option.flatMap(account, (value) =>
      Option.fromNullishOr(value.oauthAccount?.organizationUuid),
    );
    return {
      Authorization: `Bearer ${credentials.claudeAiOauth.accessToken}`,
      "anthropic-version": "2023-06-01",
      ...(Option.isSome(organization) ? { "x-organization-uuid": organization.value } : {}),
    };
  }).pipe(
    Effect.mapError(
      (cause) => new ClaudeCloudSessionsError({ operation: "read-credentials", cause }),
    ),
  );

  const getJson = <S extends Schema.Top>(url: string, schema: S, operation: string) =>
    authHeaders.pipe(
      Effect.flatMap((headers) =>
        HttpClientRequest.get(url).pipe(HttpClientRequest.setHeaders(headers), httpClient.execute),
      ),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
      Effect.timeout(Duration.seconds(30)),
      Effect.mapError((cause) =>
        isClaudeCloudSessionsError(cause)
          ? cause
          : new ClaudeCloudSessionsError({ operation, cause }),
      ),
    );

  const listEventsAfter = Effect.fn("ClaudeCloudSessions.listEventsAfter")(function* (
    sessionId: string,
    afterSequence: number,
  ) {
    // Newest first, so a long session only pages back to what is already synced.
    const events: Array<CloudEvent> = [];
    let cursor: string | null | undefined;
    let reachedSynced = false;
    do {
      const query = new URLSearchParams({ sort_order: "desc", limit: String(EVENT_PAGE_LIMIT) });
      if (cursor) query.set("cursor", cursor);
      const page = yield* getJson(
        `${API_BASE}/${encodeURIComponent(sessionId)}/events?${query}`,
        CloudEventPage,
        "list-events",
      );
      for (const event of page.data) {
        if (Number(event.sequence_num) <= afterSequence) {
          reachedSynced = true;
          break;
        }
        events.push(event);
      }
      cursor = reachedSynced || page.data.length === 0 ? null : page.next_cursor;
    } while (cursor);
    return events.reverse();
  });

  const syncSession = Effect.fn("ClaudeCloudSessions.syncSession")(function* (
    session: CloudSession,
    projectId: ProjectId,
  ) {
    const threadId = cloudThreadId(session.id);
    const existing = yield* Effect.option(orchestrator.getThreadRecords(threadId, ["turnItems"]));
    const known = syncedSequence.get(session.id);
    const afterSequence =
      known ??
      (Option.isSome(existing)
        ? Math.max(
            0,
            ...existing.value.turnItems.flatMap((item) => {
              const sequence = Number(String(item.id).split(":").at(-1));
              return Number.isFinite(sequence) ? [sequence] : [];
            }),
          )
        : 0);
    const title = cloudThreadTitle(session);
    const unchanged =
      known !== undefined &&
      Option.isSome(existing) &&
      existing.value.thread.title === title &&
      DateTime.formatIso(existing.value.thread.updatedAt) ===
        DateTime.formatIso(DateTime.makeUnsafe(session.last_event_at ?? session.created_at));
    if (unchanged) return;

    const events = yield* listEventsAfter(session.id, afterSequence);
    const messages = cloudMessages(events);
    const lastSequence = Math.max(
      afterSequence,
      ...events.map((event) => Number(event.sequence_num)),
    );
    const updatedAt = DateTime.makeUnsafe(session.last_event_at ?? session.created_at);
    const ordinalBase = Option.isSome(existing) ? existing.value.turnItems.length : 0;
    const driver = ProviderDriverKind.make("claudeAgent");
    const instanceId = defaultInstanceIdForDriver(driver);

    const threadEvent: OrchestrationV2DomainEvent = Option.isSome(existing)
      ? {
          id: EventId.make(
            `${EVENT_ID_PREFIX}:thread:${threadId}:updated:${lastSequence}:${DateTime.toEpochMillis(updatedAt)}`,
          ),
          type: "thread.metadata-updated",
          threadId,
          occurredAt: updatedAt,
          payload: { ...existing.value.thread, title, updatedAt },
        }
      : {
          id: EventId.make(`${EVENT_ID_PREFIX}:thread:${threadId}:created`),
          type: "thread.created",
          threadId,
          providerInstanceId: instanceId,
          occurredAt: DateTime.makeUnsafe(session.created_at),
          payload: {
            createdBy: "system",
            creationSource: "server",
            id: threadId,
            projectId,
            title,
            providerInstanceId: instanceId,
            modelSelection: {
              instanceId,
              model: session.config?.model ?? DEFAULT_MODEL_BY_PROVIDER[driver] ?? DEFAULT_MODEL,
            },
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: null,
            worktreePath: null,
            linkedPullRequest: null,
            branchPullRequest: null,
            activeProviderThreadId: null,
            historyOrigin: "v1_import",
            lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: threadId },
            forkedFrom: null,
            createdAt: DateTime.makeUnsafe(session.created_at),
            updatedAt,
            archivedAt: null,
            settledOverride: null,
            settledAt: null,
            unsettledAt: null,
            snoozedUntil: null,
            snoozedAt: null,
            pinnedAt: null,
            pinOrderKey: null,
            activeOrderKey: null,
            lastVisitedAt: null,
            deletedAt: null,
          } satisfies OrchestrationV2AppThread,
        };

    yield* eventSink.write({
      events: [
        threadEvent,
        ...messages.flatMap((message, index) =>
          messageEvents(threadId, message, ordinalBase + index + 1),
        ),
      ],
    });
    syncedSequence.set(session.id, lastSequence);
  });

  const syncOnce = Effect.fn("ClaudeCloudSessions.syncOnce")(function* () {
    const page = yield* getJson(
      `${API_BASE}?limit=${SESSION_PAGE_LIMIT}`,
      CloudSessionPage,
      "list-sessions",
    );
    const projectShells = yield* projects.listShells();
    let busy = false;
    for (const session of page.data.filter(isMirroredCloudSession)) {
      const repository = cloudSessionRepository(session);
      const project =
        repository === null ? undefined : projectForRepository(projectShells, repository);
      if (project === undefined) continue;
      busy ||= isCloudSessionBusy(session);
      yield* syncSession(session, project.id).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Could not sync a Claude cloud session", {
            sessionId: session.id,
            cause,
          }),
        ),
      );
    }
    return busy;
  });

  const tick = settings.getSettings.pipe(
    Effect.flatMap((current) =>
      current.claudeCloudSessionsEnabled ? syncOnce() : Effect.succeed(false),
    ),
    Effect.catch((cause) =>
      Effect.logWarning("Claude cloud session sync failed", { cause }).pipe(Effect.as(false)),
    ),
  );

  yield* forkParked(
    tick.pipe(
      Effect.flatMap((busy) => Effect.sleep(busy ? BUSY_INTERVAL : IDLE_INTERVAL)),
      Effect.forever,
    ),
  );
});

export const layer = Layer.effectDiscard(make);
