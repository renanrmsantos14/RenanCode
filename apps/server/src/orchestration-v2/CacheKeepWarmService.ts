import {
  CommandId,
  MessageId,
  type CacheKeepWarmStatus,
  type OrchestrationV2ProviderTurnTokenUsage,
  type ThreadId,
} from "@t3tools/contracts";
import {
  fallbackPromptCacheTtlMs,
  KEEP_WARM_LEAD_MS,
  KEEP_WARM_MAX_HOURS,
  KEEP_WARM_PING_TEXT,
  supportsPromptCacheFeatures,
} from "@t3tools/shared/promptCache";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberMap from "effect/FiberMap";
import * as Layer from "effect/Layer";

import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";

const BUSY_RETRY_MS = 30_000;
const HOUR_MS = 3_600_000;
const INACTIVE: CacheKeepWarmStatus = { active: false, deadlineAt: null, pings: 0 };

export class CacheKeepWarmService extends Context.Service<
  CacheKeepWarmService,
  {
    readonly status: (threadId: ThreadId) => Effect.Effect<CacheKeepWarmStatus>;
    readonly start: (threadId: ThreadId, hours: number) => Effect.Effect<CacheKeepWarmStatus>;
    readonly stop: (threadId: ThreadId) => Effect.Effect<CacheKeepWarmStatus>;
  }
>()("t3/orchestration-v2/CacheKeepWarmService") {}

/**
 * Sends a minimal ping turn shortly before the prompt cache of an idle thread expires, until the
 * deadline. State lives in memory: a server restart ends every keep-warm.
 */
export const make = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const loops = yield* FiberMap.make<ThreadId>();
  const states = new Map<ThreadId, { readonly deadlineMs: number; pings: number }>();

  const statusOf = (threadId: ThreadId): CacheKeepWarmStatus => {
    const state = states.get(threadId);
    return state === undefined
      ? INACTIVE
      : {
          active: true,
          deadlineAt: DateTime.formatIso(DateTime.makeUnsafe(state.deadlineMs)),
          pings: state.pings,
        };
  };

  const latestUsage = (
    turns: ReadonlyArray<{
      readonly tokenUsage?: OrchestrationV2ProviderTurnTokenUsage | undefined;
    }>,
  ) =>
    turns
      .flatMap((turn) => (turn.tokenUsage === undefined ? [] : [turn.tokenUsage]))
      .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];

  const keepWarm = Effect.fn("CacheKeepWarmService.keepWarm")(function* (threadId: ThreadId) {
    let lastPingExpiryMs = Number.NaN;
    while (true) {
      const state = states.get(threadId);
      if (state === undefined) return;
      const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
      if (nowMs >= state.deadlineMs) return;

      const thread = yield* projections.getThread(threadId);
      const providerThreadIds =
        thread.activeProviderThreadId === null ? [] : [thread.activeProviderThreadId];
      const records = yield* projections.getThreadRecords(
        threadId,
        ["runs", "providerThreads", "providerTurns"],
        {
          runStatuses: ["preparing", "queued", "starting", "running", "waiting"],
          providerThreadIds,
          providerTurnThreadIds: providerThreadIds,
          latestProviderTurnUsageOnly: true,
        },
      );
      if (thread.deletedAt !== null || thread.archivedAt !== null) return;
      if (records.runs.length > 0) {
        yield* Effect.sleep(Duration.millis(Math.min(BUSY_RETRY_MS, state.deadlineMs - nowMs)));
        continue;
      }
      const driver = records.providerThreads.find(
        (candidate) => candidate.id === thread.activeProviderThreadId,
      )?.driver;
      const usage = latestUsage(records.providerTurns);
      if (driver === undefined || usage === undefined || !supportsPromptCacheFeatures(driver)) {
        return;
      }
      const expiryMs =
        usage.promptCacheExpiresAt === undefined
          ? Date.parse(usage.updatedAt) +
            (usage.promptCacheTtlMs ?? fallbackPromptCacheTtlMs(driver))
          : Date.parse(usage.promptCacheExpiresAt);
      if (!Number.isFinite(expiryMs)) return;
      // A ping that did not move the expiry failed to warm the cache; stop instead of billing again.
      if (expiryMs === lastPingExpiryMs) return;
      const pingAtMs = expiryMs - KEEP_WARM_LEAD_MS;
      if (pingAtMs >= state.deadlineMs) return;
      if (nowMs < pingAtMs) {
        yield* Effect.sleep(Duration.millis(pingAtMs - nowMs));
        continue;
      }
      state.pings += 1;
      lastPingExpiryMs = expiryMs;
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(`server:keep-warm:${threadId}:${nowMs}`),
        messageId: MessageId.make(`keep-warm:${threadId}:${nowMs}`),
        threadId,
        text: KEEP_WARM_PING_TEXT,
        attachments: [],
        createdBy: "agent",
        creationSource: "server",
        dispatchMode: { type: "start_immediately" },
      });
      yield* Effect.sleep(Duration.millis(BUSY_RETRY_MS));
    }
  });

  const stop: CacheKeepWarmService["Service"]["stop"] = Effect.fn("CacheKeepWarmService.stop")(
    function* (threadId) {
      states.delete(threadId);
      yield* FiberMap.remove(loops, threadId);
      return INACTIVE;
    },
  );

  const start: CacheKeepWarmService["Service"]["start"] = Effect.fn("CacheKeepWarmService.start")(
    function* (threadId, hours) {
      const clamped = Math.min(Math.max(hours, 0), KEEP_WARM_MAX_HOURS);
      if (!(clamped > 0)) return yield* stop(threadId);
      const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
      const state = { deadlineMs: nowMs + clamped * HOUR_MS, pings: 0 };
      states.set(threadId, state);
      yield* FiberMap.run(
        loops,
        threadId,
        keepWarm(threadId).pipe(
          Effect.catch((cause) =>
            Effect.logWarning("cache keep-warm stopped", { threadId, cause }),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              // A restart replaces the state before the old loop is interrupted.
              if (states.get(threadId) === state) states.delete(threadId);
            }),
          ),
        ),
      );
      return statusOf(threadId);
    },
  );

  return CacheKeepWarmService.of({
    status: Effect.fn("CacheKeepWarmService.status")((threadId: ThreadId) =>
      Effect.sync(() => statusOf(threadId)),
    ),
    start,
    stop,
  });
});

export const layer = Layer.effect(CacheKeepWarmService, make);
