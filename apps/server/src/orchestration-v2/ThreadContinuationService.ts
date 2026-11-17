import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  EventId,
  MessageId,
  ProviderDriverKind,
  THREAD_CONTINUATION_MAX_TEXT_BYTES,
  ThreadContinuationError,
  TurnItemId,
  defaultInstanceIdForDriver,
  isRuntimeModeAbove,
  type OrchestrationV2AppThread,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2TurnItem,
  type ThreadContinuationInput,
  type ThreadContinuationMessage,
  type ThreadContinuationResult,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as ProjectService from "../project/ProjectService.ts";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as EventSink from "./EventSink.ts";
import * as Orchestrator from "./Orchestrator.ts";

const EVENT_PREFIX = "thread-continuation:v1";

const isContinuationError = Schema.is(ThreadContinuationError);
const fail = (detail: string) => new ThreadContinuationError({ detail });

export class ThreadContinuationService extends Context.Service<
  ThreadContinuationService,
  {
    /**
     * Recreates a thread from a client's offline copy as a `v1_import` thread, so its first message
     * carries the history to the model as a portable handoff.
     */
    readonly importContinuation: (
      input: ThreadContinuationInput,
    ) => Effect.Effect<ThreadContinuationResult, ThreadContinuationError>;
  }
>()("t3/orchestration-v2/ThreadContinuationService") {}

function messageEvents(
  threadId: ThreadContinuationInput["threadId"],
  message: ThreadContinuationMessage,
  index: number,
  fallback: DateTime.Utc,
): ReadonlyArray<OrchestrationV2DomainEvent> {
  const key = `${threadId}:${String(index).padStart(6, "0")}`;
  const messageId = MessageId.make(`${EVENT_PREFIX}:message:${key}`);
  const at = Option.getOrElse(DateTime.make(message.createdAt), () => fallback);
  const common = {
    id: TurnItemId.make(`${EVENT_PREFIX}:turn-item:${key}`),
    threadId,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: index + 1,
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
      id: EventId.make(`${EVENT_PREFIX}:message-event:${key}`),
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
      id: EventId.make(`${EVENT_PREFIX}:turn-item-event:${key}`),
      type: "turn-item.updated",
      threadId,
      occurredAt: at,
      payload: turnItem,
    },
  ];
}

export const make = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const eventSink = yield* EventSink.EventSinkV2;
  const projects = yield* ProjectService.ProjectService;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const providerInstances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
  const ceiling = settingsService.managedPolicy?.limits?.maxRuntimeMode;

  const importContinuation = Effect.fn("ThreadContinuationService.importContinuation")(
    function* (input: ThreadContinuationInput) {
      const existing = yield* Effect.option(orchestrator.getThreadRecords(input.threadId, []));
      // A retried request already landed.
      if (Option.isSome(existing)) return { threadId: input.threadId };
      const textBytes = input.messages.reduce(
        (total, message) => total + Buffer.byteLength(message.text, "utf8"),
        0,
      );
      if (textBytes > THREAD_CONTINUATION_MAX_TEXT_BYTES) {
        return yield* fail("The history is larger than a continuation can carry.");
      }

      const project = yield* projects.getById(input.projectId).pipe(
        Effect.mapError(() => fail("The project could not be read.")),
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(fail("This machine does not have the project.")),
            onSome: Effect.succeed,
          }),
        ),
      );
      const settings = yield* settingsService.getSettings.pipe(
        Effect.mapError(() => fail("The server settings could not be read.")),
      );
      const resolved = resolveProjectSettings(settings, input.projectId, project).settings;
      // The source's provider instance may not exist here; use this machine's default.
      const hasInstance =
        (yield* providerInstances.getInstance(input.modelSelection.instanceId)) !== undefined;
      const modelSelection = hasInstance
        ? input.modelSelection
        : (resolved.defaultModelSelection ?? {
            instanceId: defaultInstanceIdForDriver(ProviderDriverKind.make("claudeAgent")),
            model:
              DEFAULT_MODEL_BY_PROVIDER[ProviderDriverKind.make("claudeAgent")] ?? DEFAULT_MODEL,
          });
      const runtimeMode =
        ceiling !== undefined && isRuntimeModeAbove(input.runtimeMode, ceiling)
          ? ceiling
          : input.runtimeMode;

      const now = yield* DateTime.now;
      const title = input.title.trim() === "" ? "Untitled thread" : input.title;
      const thread: OrchestrationV2AppThread = {
        createdBy: "user",
        creationSource: "server",
        id: input.threadId,
        projectId: input.projectId,
        title,
        providerInstanceId: modelSelection.instanceId,
        modelSelection,
        runtimeMode,
        interactionMode: input.interactionMode,
        branch: input.branch,
        worktreePath: input.worktreePath,
        linkedPullRequest: null,
        branchPullRequest: null,
        activeProviderThreadId: null,
        historyOrigin: "v1_import",
        continuedFrom: input.source,
        lineage: {
          parentThreadId: null,
          relationshipToParent: null,
          rootThreadId: input.threadId,
        },
        forkedFrom: null,
        createdAt: now,
        updatedAt: now,
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
      };
      yield* eventSink
        .write({
          events: [
            {
              id: EventId.make(`${EVENT_PREFIX}:thread:${input.threadId}:created`),
              type: "thread.created",
              threadId: input.threadId,
              providerInstanceId: modelSelection.instanceId,
              occurredAt: now,
              payload: thread,
            },
            ...input.messages.flatMap((message, index) =>
              messageEvents(input.threadId, message, index, now),
            ),
          ],
        })
        .pipe(Effect.mapError(() => fail("The history could not be saved.")));
      return { threadId: input.threadId };
    },
    Effect.mapError((cause) =>
      isContinuationError(cause) ? cause : fail("The thread could not be created."),
    ),
  );

  return ThreadContinuationService.of({ importContinuation });
});

export const layer = Layer.effect(ThreadContinuationService, make);
