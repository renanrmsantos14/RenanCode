import {
  CheckpointScopeId,
  CommandId,
  isClaudeCloudThreadId,
  type OrchestrationV2Checkpoint,
  type OrchestrationV2ExecutionNode,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2Run,
  type OrchestrationV2TurnItem,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as CheckpointService from "./CheckpointService.ts";
import * as EventSink from "./EventSink.ts";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ServerSettings from "../serverSettings.ts";

export class CheckpointCaptureExecutionError extends Schema.TaggedError<CheckpointCaptureExecutionError>()(
  "CheckpointCaptureExecutionError",
  {
    threadId: ThreadId,
    runId: RunId,
    scopeId: CheckpointScopeId,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

const isCheckpointCaptureExecutionError = Schema.is(CheckpointCaptureExecutionError);

export interface CheckpointCaptureServiceV2Shape {
  readonly execute: (input: {
    readonly threadId: ThreadId;
    readonly runId: RunId;
    readonly scopeId: CheckpointScopeId;
  }) => Effect.Effect<void, CheckpointCaptureExecutionError>;
}

export class CheckpointCaptureServiceV2 extends Context.Service<
  CheckpointCaptureServiceV2,
  CheckpointCaptureServiceV2Shape
>()("t3/orchestration-v2/CheckpointCaptureService/CheckpointCaptureServiceV2") {}

export const layer: Layer.Layer<
  CheckpointCaptureServiceV2,
  never,
  | CheckpointService.CheckpointServiceV2
  | EventSink.EventSinkV2
  | IdAllocator.IdAllocatorV2
  | ProjectionStore.ProjectionStoreV2
  | ServerSettings.ServerSettingsService
> = Layer.effect(
  CheckpointCaptureServiceV2,
  Effect.gen(function* () {
    const checkpoints = yield* CheckpointService.CheckpointServiceV2;
    const eventSink = yield* EventSink.EventSinkV2;
    const ids = yield* IdAllocator.IdAllocatorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const serverSettings = yield* ServerSettings.ServerSettingsService;

    // Scheduled tasks and MCP launches run unattended, so nobody is waiting to type a reply.
    const wantsNextActionSuggestion = Effect.fn(
      "CheckpointCaptureService.wantsNextActionSuggestion",
    )(function* (
      context: ProjectionStore.ProjectionCheckpointCaptureContext,
      run: OrchestrationV2Run,
    ) {
      if (context.sideChat) return false;
      if (context.creationSource === "mcp" && context.relationshipToParent !== "subagent") {
        return false;
      }
      if ((yield* serverSettings.getSettings).nextActionSuggestionsEnabled !== true) return false;
      const message = yield* projections.getRunMessage(run.threadId, run.id);
      return message?.scheduledTaskId === undefined;
    });

    const execute = Effect.fn("orchestrationV2.checkpointCapture.execute")(function* (input: {
      readonly threadId: ThreadId;
      readonly runId: RunId;
      readonly scopeId: CheckpointScopeId;
    }) {
      const context = yield* projections.getCheckpointCaptureContext(input.threadId, input);
      const { run, rootNode, scope, providerThread, readyCheckpointOrdinals, sideChat } = context;
      // A Claude cloud turn edits the cloud's clone, so the local checkout has nothing to capture.
      const skipFilesystem = sideChat || isClaudeCloudThreadId(input.threadId);
      // Stopped runs remain terminal; their checkpoint is the next message's rollback point.
      const stopped = run?.status === "interrupted" || run?.status === "cancelled";

      // A checkpoint on a settled run proves this at-least-once effect already committed.
      if (
        run !== undefined &&
        run.checkpointId !== null &&
        (run.status === "completed" || stopped)
      ) {
        return;
      }
      // Rollback uses the same lane and can precede a capture retry; preserve the restored workspace and discarded run.
      if (run?.status === "rolled_back") {
        return;
      }

      if (
        run === undefined ||
        (run.status !== "waiting" && !stopped) ||
        rootNode === undefined ||
        scope === undefined ||
        rootNode.checkpointScopeId !== scope.id ||
        providerThread === undefined
      ) {
        return yield* new CheckpointCaptureExecutionError({
          threadId: input.threadId,
          runId: input.runId,
          scopeId: input.scopeId,
          cause: "The persisted checkpoint capture target is incomplete or no longer waiting.",
        });
      }

      const capturedAt = yield* DateTime.now;
      const baselineOrdinalWithinScope = Math.max(0, run.ordinal - 1);
      const hasReadyCheckpoint = (ordinalWithinScope: number) =>
        readyCheckpointOrdinals.includes(ordinalWithinScope);
      // The baselines this capture materializes are attributed to the run materializing them. The
      // thread's scope may already be a later run's: one queued meanwhile, or sent after Stop.
      const materializeBaseline = (ordinalWithinScope: number) =>
        checkpoints.materializeBaselineCheckpoint({
          scope,
          ordinalWithinScope,
          nodeId: rootNode.id,
          capturedAt: run.requestedAt,
          forceMissing: skipFilesystem,
        });
      const threadStartCheckpoint =
        baselineOrdinalWithinScope === 0 || hasReadyCheckpoint(0)
          ? null
          : yield* materializeBaseline(0);
      const baselineCheckpoint = hasReadyCheckpoint(baselineOrdinalWithinScope)
        ? null
        : yield* materializeBaseline(baselineOrdinalWithinScope);
      const checkpoint = yield* checkpoints.capture({
        scope,
        runId: run.id,
        nodeId: rootNode.id,
        ordinalWithinScope: run.ordinal,
        appRunOrdinal: run.ordinal,
        capturedAt,
        forceMissing: skipFilesystem,
      });
      // Omit delegatedCompletion to preserve cohort writes made after capture loaded the run.
      const { delegatedCompletion: _delegatedCompletion, ...runWithoutDelegatedCompletion } = run;
      const commandId = CommandId.make(`command:effect:checkpoint.capture:${run.id}`);
      const suggestNextAction =
        !stopped &&
        (yield* wantsNextActionSuggestion(context, run).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Next action suggestion eligibility failed", { cause }).pipe(
              Effect.as(false),
            ),
          ),
        ));
      yield* eventSink.commitCommand({
        commandId,
        threadId: input.threadId,
        commandType: "checkpoint.capture",
        acceptedAt: capturedAt,
        effects: suggestNextAction
          ? [
              {
                id: `effect:next-action-suggestion.generate:${run.id}`,
                commandId: CommandId.make(`command:effect:next-action-suggestion:${run.id}`),
                threadId: input.threadId,
                request: { type: "next-action-suggestion.generate", runId: run.id },
              },
            ]
          : [],
        events: [
          ...(threadStartCheckpoint === null
            ? []
            : [
                {
                  id: yield* ids.allocate.event({ threadId: input.threadId, commandId }),
                  type: "checkpoint.captured" as const,
                  threadId: input.threadId,
                  nodeId: threadStartCheckpoint.nodeId,
                  driver: providerThread.driver,
                  providerInstanceId: run.providerInstanceId,
                  occurredAt: capturedAt,
                  payload: threadStartCheckpoint,
                },
              ]),
          ...(baselineCheckpoint === null
            ? []
            : [
                {
                  id: yield* ids.allocate.event({ threadId: input.threadId, commandId }),
                  type: "checkpoint.captured" as const,
                  threadId: input.threadId,
                  nodeId: baselineCheckpoint.nodeId,
                  driver: providerThread.driver,
                  providerInstanceId: run.providerInstanceId,
                  occurredAt: capturedAt,
                  payload: baselineCheckpoint,
                },
              ]),
          {
            id: yield* ids.allocate.event({ threadId: input.threadId, commandId }),
            type: "checkpoint.captured",
            threadId: input.threadId,
            runId: run.id,
            nodeId: rootNode.id,
            driver: providerThread.driver,
            providerInstanceId: run.providerInstanceId,
            occurredAt: capturedAt,
            payload: checkpoint,
          },
          {
            id: yield* ids.allocate.event({ threadId: input.threadId, commandId }),
            type: "turn-item.updated",
            threadId: input.threadId,
            runId: run.id,
            nodeId: rootNode.id,
            driver: providerThread.driver,
            providerInstanceId: run.providerInstanceId,
            occurredAt: capturedAt,
            payload: makeCheckpointTurnItem({
              idAllocator: ids,
              run,
              rootNode,
              providerThread,
              checkpoint,
              completedAt: capturedAt,
            }),
          },
          {
            id: yield* ids.allocate.event({ threadId: input.threadId, commandId }),
            type: "run.updated",
            threadId: input.threadId,
            runId: run.id,
            nodeId: rootNode.id,
            providerInstanceId: run.providerInstanceId,
            occurredAt: capturedAt,
            payload: stopped
              ? { ...runWithoutDelegatedCompletion, checkpointId: checkpoint.id }
              : {
                  ...runWithoutDelegatedCompletion,
                  status: "completed",
                  completedAt: capturedAt,
                  checkpointId: checkpoint.id,
                },
          },
          ...(stopped
            ? []
            : [
                {
                  id: yield* ids.allocate.event({ threadId: input.threadId, commandId }),
                  type: "node.updated" as const,
                  threadId: input.threadId,
                  runId: run.id,
                  nodeId: rootNode.id,
                  providerInstanceId: run.providerInstanceId,
                  occurredAt: capturedAt,
                  payload: {
                    ...rootNode,
                    status: "completed" as const,
                    completedAt: capturedAt,
                    checkpointScopeId: scope.id,
                  },
                },
              ]),
          ...(suggestNextAction
            ? [
                {
                  id: yield* ids.allocate.event({ threadId: input.threadId, commandId }),
                  type: "run.next-action-suggestion-updated" as const,
                  threadId: input.threadId,
                  runId: run.id,
                  providerInstanceId: run.providerInstanceId,
                  occurredAt: capturedAt,
                  payload: { runId: run.id, nextActionSuggestion: { status: "pending" as const } },
                },
              ]
            : []),
        ],
      });
    });

    return CheckpointCaptureServiceV2.of({
      execute: Effect.fn("CheckpointCaptureServiceV2.execute")(function (input) {
        return execute(input).pipe(
          Effect.mapError((cause) =>
            isCheckpointCaptureExecutionError(cause)
              ? cause
              : new CheckpointCaptureExecutionError({ ...input, cause }),
          ),
        );
      }),
    });
  }),
);

function makeCheckpointTurnItem(input: {
  readonly idAllocator: IdAllocator.IdAllocatorV2["Service"];
  readonly run: OrchestrationV2Run;
  readonly rootNode: OrchestrationV2ExecutionNode;
  readonly providerThread: OrchestrationV2ProviderThread;
  readonly checkpoint: OrchestrationV2Checkpoint;
  readonly completedAt: DateTime.Utc;
}): OrchestrationV2TurnItem {
  return {
    id: input.idAllocator.derive.turnItemFromProviderItem({
      driver: input.providerThread.driver,
      nativeItemId: `checkpoint:${input.checkpoint.id}`,
    }),
    threadId: input.run.threadId,
    runId: input.run.id,
    nodeId: input.rootNode.id,
    providerThreadId: input.providerThread.id,
    providerTurnId: input.rootNode.providerTurnId,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: input.run.ordinal * 100 + 99,
    status: "completed",
    title: null,
    startedAt: input.completedAt,
    completedAt: input.completedAt,
    updatedAt: input.completedAt,
    type: "checkpoint",
    checkpointId: input.checkpoint.id,
    scopeId: input.checkpoint.scopeId,
    files: input.checkpoint.files,
  };
}
