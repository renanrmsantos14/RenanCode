import {
  CLAUDE_CLOUD_THREAD_ID_PREFIX,
  CommandId,
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  EventId,
  MessageId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnItemId,
  defaultInstanceIdForDriver,
  isClaudeCloudThreadId,
  type OrchestrationProjectShell,
  type OrchestrationV2AppThread,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2TurnItem,
  type ProjectId,
  ClaudeCloudStartSessionError,
  type ClaudeCloudStartSessionInput,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClientError from "effect/http/HttpClientError";
import * as Path from "effect/Path";

import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { resolveClaudeHomePath } from "../provider/Drivers/ClaudeHome.ts";
import { forkParked } from "../serverActivation.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as VcsStatusBroadcaster from "../vcs/VcsStatusBroadcaster.ts";
import {
  API_BASE,
  API_ROOT,
  ClaudeCloudSessionsError,
  makeClaudeCloudHttp,
  type ClaudeAccountRef,
} from "./ClaudeCloudHttp.ts";

const IDLE_INTERVAL = Duration.seconds(60);
const BUSY_INTERVAL = Duration.seconds(5);
const SESSION_PAGE_LIMIT = 50;
const EVENT_PAGE_LIMIT = 200;
const EVENT_ID_PREFIX = "claude-cloud";
const TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);

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

const EnvironmentProviderPage = Schema.Struct({
  environments: Schema.Array(Schema.Struct({ environment_id: Schema.String, kind: Schema.String })),
});

interface CloudAccount extends ClaudeAccountRef {
  readonly instanceId: ProviderInstanceId;
}

function claudeHomePathOf(config: unknown): string {
  const homePath =
    typeof config === "object" && config !== null
      ? (config as { readonly homePath?: unknown }).homePath
      : undefined;
  return typeof homePath === "string" ? homePath.trim() : "";
}

/** Same order as the Claude CLI: Anthropic's cloud first, then anything that is not a bridge. */
export function chooseCloudEnvironment<E extends { readonly kind: string }>(
  environments: ReadonlyArray<E>,
): E | undefined {
  return (
    environments.find((environment) => environment.kind === "anthropic_cloud") ??
    environments.find((environment) => environment.kind !== "bridge")
  );
}

const CreatedSession = Schema.Struct({
  id: Schema.optional(Schema.String),
  session: Schema.optional(Schema.Struct({ id: Schema.String })),
});

const CloudEventPage = Schema.Struct({
  data: Schema.Array(CloudEvent),
  next_cursor: Schema.optional(Schema.NullOr(Schema.String)),
});

interface CloudRepository {
  readonly owner: string;
  readonly name: string;
}

interface CloudMessage {
  readonly sequence: string;
  /** Echoes the id T3 sent the prompt with, so the mirror can skip its own messages. */
  readonly uuid: string | null;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
}

/** "bridge" sessions are Remote Control views of a local session, which T3 already shows. */
export function isMirroredCloudSession(session: CloudSession): boolean {
  return session.environment_kind !== "bridge";
}

function isCloudSessionArchived(session: CloudSession): boolean {
  return session.status === "archived";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cloudSessionIdOf(threadId: string): string | null {
  return isClaudeCloudThreadId(threadId)
    ? threadId.slice(CLAUDE_CLOUD_THREAD_ID_PREFIX.length)
    : null;
}

function isCloudSessionBusy(session: CloudSession): boolean {
  return session.worker_status === "running";
}

function gitHubRepository(url: string | undefined): CloudRepository | null {
  const match =
    url === undefined ? null : /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i.exec(url);
  return match?.[1] && match[2]
    ? { owner: match[1].toLowerCase(), name: match[2].toLowerCase() }
    : null;
}

export function cloudSessionRepository(session: CloudSession): CloudRepository | null {
  for (const source of session.config?.sources ?? []) {
    if (source.type !== "git_repository") continue;
    const repository = gitHubRepository(source.url);
    if (repository !== null) return repository;
  }
  return null;
}

type MatchableProject = Pick<OrchestrationProjectShell, "id" | "archivedAt" | "repositoryIdentity">;

/** A fork's identity prefers `upstream`, while cloud sessions run on `origin`, so either matches. */
export function projectForRepository(
  projects: ReadonlyArray<MatchableProject>,
  repository: CloudRepository,
): MatchableProject | undefined {
  return projects.find((project) => {
    const identity = project.repositoryIdentity;
    if (project.archivedAt != null || identity == null) return false;
    return [identity.locator.remoteUrl, identity.origin?.remoteUrl].some((url) => {
      const candidate = gitHubRepository(url);
      return candidate?.owner === repository.owner && candidate.name === repository.name;
    });
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
          uuid?: unknown;
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
        uuid: typeof payload.uuid === "string" ? payload.uuid : null,
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
  const vcsStatus = yield* VcsStatusBroadcaster.VcsStatusBroadcaster;
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const eventSink = yield* EventSink.EventSinkV2;
  const path = yield* Path.Path;
  const { getJson, post, postJson, toCloudError } = yield* makeClaudeCloudHttp;

  // Last event sequence written per session; rebuilt from the projection after a restart.
  const syncedSequence = new Map<string, number>();
  const projectBySession = new Map<string, ProjectId>();

  // Each enabled Claude provider instance is its own claude.ai login (its own home directory).
  const listAccounts = Effect.gen(function* () {
    const current = yield* settings.getSettings.pipe(Effect.orDie);
    const defaultId = defaultInstanceIdForDriver(ProviderDriverKind.make("claudeAgent"));
    const instances = Object.entries(current.providerInstances).filter(
      ([, instance]) => instance.driver === "claudeAgent" && instance.enabled !== false,
    );
    const configured = instances.some(([id]) => id === defaultId);
    const disabledDefault = current.providerInstances[defaultId]?.enabled === false;
    const entries: ReadonlyArray<readonly [string, unknown]> = [
      ...(configured || disabledDefault ? [] : [[defaultId, undefined] as const]),
      ...instances.map(([id, instance]) => [id, instance.config] as const),
    ];
    return yield* Effect.forEach(entries, ([id, config]) =>
      Effect.gen(function* () {
        const homePath = claudeHomePathOf(config);
        const configDir = yield* resolveClaudeHomePath({ homePath }).pipe(
          Effect.provideService(Path.Path, path),
        );
        return {
          instanceId: ProviderInstanceId.make(id),
          configDir,
          // The CLI keeps account metadata beside a custom home, and in ~ for the default one.
          accountFile:
            homePath === ""
              ? path.join(path.dirname(configDir), ".claude.json")
              : path.join(configDir, ".claude.json"),
        } satisfies CloudAccount;
      }),
    );
  });

  const accountFor = (instanceId: ProviderInstanceId | undefined) =>
    listAccounts.pipe(
      Effect.map(
        (accounts) => accounts.find((account) => account.instanceId === instanceId) ?? accounts[0],
      ),
    );

  const listEventsAfter = Effect.fn("ClaudeCloudSessions.listEventsAfter")(function* (
    account: CloudAccount,
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
        account,
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
    account: CloudAccount,
    session: CloudSession,
    projectId: ProjectId,
  ) {
    const threadId = cloudThreadId(session.id);
    const existing = yield* Effect.option(
      orchestrator.getThreadRecords(threadId, ["turnItems", "runs"]),
    );
    const runs = Option.isSome(existing) ? existing.value.runs : [];
    // While T3 runs a turn here the Claude adapter streams it; the mirror would only duplicate it.
    if (runs.some((run) => !TERMINAL_RUN_STATUSES.has(run.status))) return;
    // Turns T3 ran are already shown; only later ones, started on claude.ai, need mirroring.
    const lastRunEndedAt = runs.reduce(
      (latest, run) =>
        run.completedAt === null
          ? latest
          : Math.max(latest, DateTime.toEpochMillis(run.completedAt)),
      0,
    );
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

    const events = yield* listEventsAfter(account, session.id, afterSequence);
    const sentFromT3 = new Set(
      Option.isSome(existing)
        ? existing.value.turnItems.flatMap((item) =>
            item.type === "user_message" ? [String(item.messageId)] : [],
          )
        : [],
    );
    const messages = cloudMessages(events).filter(
      (message) =>
        (message.uuid === null || !sentFromT3.has(message.uuid)) &&
        Date.parse(message.createdAt) > lastRunEndedAt,
    );
    const lastSequence = Math.max(
      afterSequence,
      ...events.map((event) => Number(event.sequence_num)),
    );
    const updatedAt = DateTime.makeUnsafe(session.last_event_at ?? session.created_at);
    // A prompt sent from T3 moves the thread's updatedAt without new cloud content; nothing to write.
    if (messages.length === 0 && Option.isSome(existing) && existing.value.thread.title === title) {
      syncedSequence.set(session.id, lastSequence);
      return;
    }
    const ordinalBase = Option.isSome(existing) ? existing.value.turnItems.length : 0;
    const driver = ProviderDriverKind.make("claudeAgent");
    // The thread remembers its account so replies and archives go through the same login.
    const instanceId = account.instanceId;

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

  // Archived on claude.ai: archive the T3 thread too. The archive effect then gets a 409, a no-op.
  const archiveMirror = Effect.fn("ClaudeCloudSessions.archiveMirror")(function* (
    session: CloudSession,
  ) {
    const threadId = cloudThreadId(session.id);
    const existing = yield* Effect.option(orchestrator.getThreadRecords(threadId, []));
    if (Option.isNone(existing) || existing.value.thread.archivedAt !== null) return;
    yield* orchestrator.dispatch({
      type: "thread.archive",
      commandId: CommandId.make(`server:claude-cloud-archive:${session.id}`),
      threadId,
    });
  });

  const syncOnce = Effect.fn("ClaudeCloudSessions.syncOnce")(function* () {
    let busy = false;
    // One failing login (expired token, revoked app) must not stop the other accounts.
    for (const account of yield* listAccounts) {
      busy ||= yield* syncAccount(account).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Claude cloud session sync failed", {
            instanceId: account.instanceId,
            cause,
          }).pipe(Effect.as(false)),
        ),
      );
    }
    return busy;
  });

  const syncAccount = Effect.fn("ClaudeCloudSessions.syncAccount")(function* (
    account: CloudAccount,
  ) {
    const page = yield* getJson(
      account,
      `${API_BASE}?limit=${SESSION_PAGE_LIMIT}`,
      CloudSessionPage,
      "list-sessions",
    );
    const sessions = page.data.filter(isMirroredCloudSession);
    // listPage reads the git remote when the enrichment cache is cold; listShells would not.
    const projectList = sessions.some((session) => !projectBySession.has(session.id))
      ? (yield* projects.listPage({ cursor: 0, limit: 1000 })).projects
      : [];
    let busy = false;
    for (const session of sessions) {
      if (isCloudSessionArchived(session)) {
        yield* archiveMirror(session).pipe(
          Effect.catch((cause) =>
            Effect.logWarning("Could not archive a Claude cloud thread", {
              sessionId: session.id,
              cause,
            }),
          ),
        );
        continue;
      }
      const repository = cloudSessionRepository(session);
      const projectId =
        projectBySession.get(session.id) ??
        (repository === null ? undefined : projectForRepository(projectList, repository)?.id);
      if (projectId === undefined) continue;
      projectBySession.set(session.id, projectId);
      busy ||= isCloudSessionBusy(session);
      yield* syncSession(account, session, projectId).pipe(
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

  const wakeups = yield* Queue.sliding<void>(1);
  yield* forkParked(
    tick.pipe(
      Effect.flatMap((busy) =>
        Queue.take(wakeups).pipe(
          Effect.timeoutOrElse({
            duration: busy ? BUSY_INTERVAL : IDLE_INTERVAL,
            orElse: () => Effect.void,
          }),
        ),
      ),
      Effect.forever,
    ),
  );

  // A cloud thread is pinned to the login that owns its session, recorded as its provider instance.
  const resolveThreadSession = Effect.fn("ClaudeCloudSessions.resolveThreadSession")(function* (
    threadId: ThreadId,
  ) {
    const sessionId = cloudSessionIdOf(threadId);
    if (sessionId === null) {
      return yield* new ClaudeCloudSessionsError({ operation: "resolve-session", cause: threadId });
    }
    const thread = yield* orchestrator
      .getThreadRecords(threadId, [])
      .pipe(Effect.mapError(toCloudError("resolve-session")));
    const account = yield* accountFor(thread.thread.providerInstanceId);
    if (account === undefined) {
      return yield* new ClaudeCloudSessionsError({ operation: "resolve-account", cause: threadId });
    }
    return { sessionId, account };
  });

  const archive = Effect.fn("ClaudeCloudSessions.archive")(function* (threadId: ThreadId) {
    const { sessionId, account } = yield* resolveThreadSession(threadId);
    yield* post(
      account,
      `${API_BASE}/${encodeURIComponent(sessionId)}/archive`,
      {},
      "archive",
    ).pipe(
      // 409: already archived, for example on claude.ai first.
      Effect.catchIf(
        (error) =>
          HttpClientError.isHttpClientError(error.cause) &&
          error.cause.reason._tag === "StatusCodeError" &&
          error.cause.reason.response.status === 409,
        () => Effect.void,
      ),
    );
  });

  const startError = (
    reason: ClaudeCloudStartSessionError["reason"],
    detail: string,
  ): ClaudeCloudStartSessionError => new ClaudeCloudStartSessionError({ reason, detail });

  const pickEnvironment = (account: CloudAccount) =>
    getJson(
      account,
      `${API_ROOT}/v1/environment_providers?limit=100`,
      EnvironmentProviderPage,
      "list-environments",
    ).pipe(Effect.map(({ environments }) => chooseCloudEnvironment(environments)));

  const start = Effect.fn("ClaudeCloudSessions.start")(function* (
    input: ClaudeCloudStartSessionInput,
  ) {
    if (!(yield* settings.getSettings.pipe(Effect.orDie)).claudeCloudSessionsEnabled) {
      return yield* startError("disabled", "Turn on Claude cloud sessions in Settings > Labs.");
    }
    const project = (yield* projects
      .listPage({ cursor: 0, limit: 1000 })
      .pipe(Effect.orDie)).projects.find((candidate) => candidate.id === input.projectId);
    const identity = project?.repositoryIdentity;
    // The fork's origin, when there is one, is where its branches get pushed.
    const repository = gitHubRepository(identity?.origin?.remoteUrl ?? identity?.locator.remoteUrl);
    if (project === undefined || repository === null) {
      return yield* startError("not-github", "Cloud sessions need a project with a GitHub remote.");
    }
    const status = yield* vcsStatus
      .getStatus({ cwd: project.workspaceRoot })
      .pipe(Effect.mapError((cause) => startError("unavailable", cause.message)));
    const branch = status.refName;
    if (branch === null || !status.hasUpstream || status.aheadCount > 0) {
      return yield* startError(
        "branch-not-pushed",
        `Push ${branch ?? "this branch"} first: the cloud session clones it from GitHub.`,
      );
    }
    const account = yield* accountFor(input.providerInstanceId);
    if (account === undefined) {
      return yield* startError("unavailable", "No Claude login is set up on this machine.");
    }
    const environment = yield* pickEnvironment(account).pipe(
      Effect.mapError((cause) => startError("unavailable", cause.message)),
    );
    if (environment === undefined) {
      return yield* startError(
        "unavailable",
        "No Claude cloud environment is set up on claude.ai.",
      );
    }
    const repo = `${repository.owner}/${repository.name}`;
    const title = input.text.split("\n")[0]!.slice(0, 80);
    const created = yield* postJson(
      account,
      API_BASE,
      {
        title,
        environment_id: environment.environment_id,
        events: [
          {
            payload: {
              ...(UUID_PATTERN.test(input.messageId) ? { uuid: input.messageId } : {}),
              session_id: "",
              type: "user",
              parent_tool_use_id: null,
              message: { role: "user", content: input.text },
            },
          },
        ],
        config: {
          sources: [
            { type: "git_repository", url: `https://github.com/${repo}`, revision: branch },
          ],
          outcomes: [
            {
              type: "git_repository",
              git_info: {
                type: "github",
                repo,
                branches: [`claude/${input.messageId.slice(0, 8)}`],
              },
            },
          ],
          ...(input.model === undefined ? {} : { model: input.model }),
        },
      },
      CreatedSession,
      "create-session",
    ).pipe(Effect.mapError((cause) => startError("unavailable", cause.message)));
    const sessionId = created.session?.id ?? created.id;
    if (sessionId === undefined) {
      return yield* startError("unavailable", "claude.ai did not return a session id.");
    }
    projectBySession.set(sessionId, project.id);
    const now = DateTime.formatIso(yield* DateTime.now);
    // Mirror right away so the client can open the thread; the poller fills in the rest.
    yield* syncSession(
      account,
      {
        id: sessionId,
        title,
        created_at: now,
        last_event_at: now,
        ...(input.model === undefined ? {} : { config: { model: input.model } }),
      },
      project.id,
    ).pipe(Effect.mapError((cause) => startError("unavailable", cause.message)));
    yield* Queue.offer(wakeups, undefined);
    return { threadId: cloudThreadId(sessionId) };
  });

  return { archive, start };
});

export class ClaudeCloudSessions extends Context.Service<
  ClaudeCloudSessions,
  Effect.Success<typeof make>
>()("t3/claudeCloud/ClaudeCloudSessions") {}

export const layer = Layer.effect(ClaudeCloudSessions, make);
