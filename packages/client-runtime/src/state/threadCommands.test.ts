import { describe, expect, it } from "@effect/vitest";
import {
  CommandId,
  RuntimeRequestId,
  EnvironmentId,
  MessageId,
  RunId,
  ORCHESTRATION_V2_WS_METHODS,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2Command,
  type OrchestrationV2ShellSnapshot,
  NodeId,
  type OrchestrationV2RuntimeRequest,
  ProviderSessionId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";

import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { RpcSession } from "../rpc/session.ts";
import { createThreadEnvironmentAtoms } from "./threadCommands.ts";
import * as ThreadHistoryController from "./threadHistoryController.ts";
import { v2Projection } from "./orchestrationV2TestFixtures.ts";
import { EMPTY_ENVIRONMENT_THREAD_STATE, type EnvironmentThreadState } from "./threadState.ts";

const ENVIRONMENT_ID = EnvironmentId.make("remote");
const THREAD_ID = ThreadId.make("thread");
const NOW = DateTime.makeUnsafe("2026-09-12T10:00:00.000Z");
const FUTURE = DateTime.makeUnsafe("2099-01-01T00:00:00.000Z");
const APPROVAL = {
  id: RuntimeRequestId.make("approval"),
  kind: "command" as const,
  createdAt: NOW,
};
const USER_INPUT = {
  id: RuntimeRequestId.make("input"),
  kind: "user_input" as const,
  createdAt: NOW,
};
const SNAPSHOT: OrchestrationV2ShellSnapshot = {
  snapshotSequence: 1,
  schemaVersion: 2,
  archivedThreads: [],
  projects: [],
  threads: [
    {
      id: THREAD_ID,
      projectId: ProjectId.make("project"),
      title: "Remote thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
      providerInstanceId: ProviderInstanceId.make("codex"),
      lineage: { rootThreadId: THREAD_ID, parentThreadId: null, relationshipToParent: null },
      forkedFrom: null,
      activeProviderThreadId: null,
      latestRunId: null,
      activeRunId: null,
      status: "idle",
      pendingRuntimeRequest: null,
      latestVisibleMessage: null,
      itemCount: 0,
      visibleItemCount: 0,
      deletedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      pullRequests: [],
      latestUserMessageAt: null,
      hasActionableProposedPlan: false,
    },
  ],
};

const pendingRuntimeRequest = (
  id: RuntimeRequestId,
  kind: OrchestrationV2RuntimeRequest["kind"],
): OrchestrationV2RuntimeRequest => ({
  id,
  nodeId: NodeId.make(`node-${id}`),
  providerTurnId: null,
  nativeRequestRef: null,
  kind,
  status: "pending",
  responseCapability: { type: "live", providerSessionId: ProviderSessionId.make("session") },
  createdAt: NOW,
  resolvedAt: null,
});
const THREAD_STATE: EnvironmentThreadState = {
  ...EMPTY_ENVIRONMENT_THREAD_STATE,
  data: Option.some({
    ...v2Projection,
    runtimeRequests: [
      pendingRuntimeRequest(APPROVAL.id, "command"),
      pendingRuntimeRequest(USER_INPUT.id, "user_input"),
    ],
  }),
  status: "live",
  sequence: 3,
};

const makeHarness = Effect.fn("TestThreadCommands.makeHarness")(function* (options?: {
  readonly loadEarlier?: () => Effect.Effect<ThreadHistoryController.ThreadHistoryLoadEarlierResult>;
  readonly reconcilePendingWork?: (threadId: ThreadId) => Effect.Effect<void>;
}) {
  const requests = yield* Queue.unbounded<{
    command: OrchestrationV2Command;
    reply: Deferred.Deferred<{ sequence: number }, Error>;
  }>();
  const reconciled = yield* Queue.unbounded<ThreadId>();
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: { environmentId: ENVIRONMENT_ID },
    session: yield* SubscriptionRef.make(
      Option.some({
        client: {
          [ORCHESTRATION_V2_WS_METHODS.dispatchCommand]: (command: OrchestrationV2Command) =>
            Effect.gen(function* () {
              const reply = yield* Deferred.make<{ sequence: number }, Error>();
              yield* Queue.offer(requests, { command, reply });
              return yield* Deferred.await(reply);
            }),
        },
      } as unknown as RpcSession),
    ),
  } as EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  const runtime = Atom.runtime(
    Layer.mergeAll(
      Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, {
        run: (_environmentId, effect) =>
          Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
      } as EnvironmentRegistry.EnvironmentRegistry["Service"]),
      Layer.succeed(
        SecureRandom.SecureRandom,
        SecureRandom.make((size) => new Uint8Array(size)),
      ),
      Layer.succeed(
        ThreadHistoryController.ThreadHistoryController,
        ThreadHistoryController.ThreadHistoryController.of({
          register: () => Effect.die("unused"),
          unregister: () => Effect.void,
          loadEarlier: () => options?.loadEarlier?.() ?? Effect.die("unused"),
          reconcilePendingWork: (_environmentId, threadId) =>
            options?.reconcilePendingWork?.(threadId) ?? Queue.offer(reconciled, threadId),
        }),
      ),
    ),
  );
  const snapshotAtom = Atom.family((_environmentId: EnvironmentId) => Atom.make(SNAPSHOT));
  const threadStateFamily = Atom.family((_key: string) =>
    Atom.make(AsyncResult.success(THREAD_STATE)),
  );
  const threadStateAtom = (environmentId: EnvironmentId, threadId: ThreadId) =>
    threadStateFamily(`${environmentId}:${threadId}`);
  const commands = createThreadEnvironmentAtoms(runtime, snapshotAtom, threadStateAtom);
  const registry = AtomRegistry.make();
  yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()));
  const visibleAtom = commands.snapshotAtom(ENVIRONMENT_ID);
  registry.mount(visibleAtom);
  const sourceStateAtom = threadStateAtom(ENVIRONMENT_ID, THREAD_ID);
  const stateAtom = commands.threadStateAtom(ENVIRONMENT_ID, THREAD_ID);
  registry.mount(stateAtom);
  return {
    registry,
    commands,
    snapshotAtom,
    visibleAtom,
    sourceStateAtom,
    stateAtom,
    requests,
    reconciled,
  };
});

describe("history loading", () => {
  it.effect("sends a message on the thread while earlier history is loading", () =>
    Effect.gen(function* () {
      const historyStarted = yield* Deferred.make<void>();
      const historyReply =
        yield* Deferred.make<ThreadHistoryController.ThreadHistoryLoadEarlierResult>();
      const h = yield* makeHarness({
        loadEarlier: () =>
          Deferred.succeed(historyStarted, undefined).pipe(
            Effect.andThen(Deferred.await(historyReply)),
          ),
      });
      yield* Effect.addFinalizer(() => Deferred.succeed(historyReply, { _tag: "loaded" }));
      const history = h.commands.loadEarlierHistory.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID },
      });
      yield* Deferred.await(historyStarted);
      const send = h.commands.startTurn.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: {
          threadId: THREAD_ID,
          message: {
            messageId: MessageId.make("message"),
            role: "user",
            text: "Send while history loads",
            attachments: [],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          dispatchMode: "start",
        },
      });
      // Dispatched after Send on another thread, so it arrives first only if Send is queued.
      const controlThreadId = ThreadId.make("control-thread");
      const control = h.commands.interruptTurn.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: controlThreadId, runId: RunId.make("control-run") },
      });
      const first = yield* Queue.take(h.requests);
      yield* Deferred.succeed(first.reply, { sequence: 1 });
      yield* Deferred.succeed(historyReply, { _tag: "loaded" });
      const second = yield* Queue.take(h.requests);
      yield* Deferred.succeed(second.reply, { sequence: 2 });
      const results = yield* Effect.promise(() => Promise.all([history, send, control]));

      expect(first.command).toMatchObject({ type: "message.dispatch", threadId: THREAD_ID });
      expect(second.command).toMatchObject({ type: "run.interrupt", threadId: controlThreadId });
      expect(results.map((value) => value._tag)).toEqual(["Success", "Success", "Success"]);
    }),
  );
});

describe("interrupt turn", () => {
  // A stale cached item has nothing left to interrupt, so the server can reject Stop.
  it.effect("reconciles pending work when the server rejects the interrupt", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const result = h.commands.interruptTurn.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID, runId: RunId.make("finished-run") },
      });
      const request = yield* Queue.take(h.requests);
      expect(request.command.type).toBe("run.interrupt");
      yield* Deferred.fail(request.reply, new Error("Run is not interruptible"));
      expect((yield* Effect.promise(() => result))._tag).toBe("Failure");
      expect(yield* Queue.take(h.reconciled)).toBe(THREAD_ID);
    }),
  );

  // Mirrors the thread state's handler: the lookup runs in the thread's scope and is joined.
  const stopWithBlockedLookup = Effect.fn("stopWithBlockedLookup")(function* () {
    const threadScope = yield* Scope.make();
    const asked = yield* Deferred.make<void>();
    const h = yield* makeHarness({
      reconcilePendingWork: () =>
        Deferred.succeed(asked, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.forkIn(threadScope),
          Effect.flatMap(Fiber.join),
        ),
    });
    const result = h.commands.interruptTurn.run(h.registry, {
      environmentId: ENVIRONMENT_ID,
      input: { threadId: THREAD_ID, runId: RunId.make("running-run") },
    });
    const request = yield* Queue.take(h.requests);
    yield* Deferred.succeed(request.reply, { sequence: 1 });
    yield* Deferred.await(asked);
    return { threadScope, result };
  });

  it.effect("resolves Stop without waiting for the pending work lookup", () =>
    Effect.gen(function* () {
      const { threadScope, result } = yield* stopWithBlockedLookup();
      expect((yield* Effect.promise(() => result))._tag).toBe("Success");
      yield* Scope.close(threadScope, Exit.void);
    }),
  );

  it.effect("keeps an accepted Stop when the thread closes during the lookup", () =>
    Effect.gen(function* () {
      const { threadScope, result } = yield* stopWithBlockedLookup();
      yield* Scope.close(threadScope, Exit.void);
      expect((yield* Effect.promise(() => result))._tag).toBe("Success");
    }),
  );
});

describe("remote thread lifecycle commands", () => {
  const actions = [
    ["settle", {}, { settledOverride: "settled", pinnedAt: null, snoozedUntil: null }],
    ["unsettle", { reason: "user" }, { settledOverride: "active", settledAt: null }],
    ["snooze", { snoozedUntil: "2099-01-01T00:00:00.000Z" }, { snoozedUntil: FUTURE }],
    ["unsnooze", { reason: "user" }, { snoozedUntil: null, snoozedAt: null }],
    ["pin", { orderKey: "a" }, { pinnedAt: expect.any(Object), pinOrderKey: "a" }],
    ["unpin", {}, { pinnedAt: null, pinOrderKey: null }],
    ["setAutoSettle", { enabled: false }, { autoSettleDisabledAt: expect.any(Object) }],
    ["reorderPin", { orderKey: "b" }, { pinOrderKey: "b" }],
    ["reorderActive", { orderKey: "b" }, { activeOrderKey: "b" }],
  ] as const;

  it.effect.each(actions)(
    "shows %s before a delayed remote reply and rolls back a rejection",
    ([action, input, expected]) =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const source = h.snapshotAtom(ENVIRONMENT_ID);
        const initial = {
          ...SNAPSHOT,
          threads: [
            {
              ...SNAPSHOT.threads[0]!,
              ...(action === "unsettle" || action === "pin"
                ? { settledOverride: "settled" as const, settledAt: NOW }
                : {}),
              ...(action === "unsnooze" || action === "settle" || action === "pin"
                ? { snoozedUntil: FUTURE, snoozedAt: NOW }
                : {}),
              ...(action === "unpin" || action === "settle"
                ? { pinnedAt: NOW, pinOrderKey: "a" }
                : {}),
            },
          ],
        };
        h.registry.set(source, initial);
        const result = h.commands[action].run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: {
            threadId: THREAD_ID,
            commandId: CommandId.make(action),
            reason: "user",
            enabled: false,
            orderKey: "a",
            snoozedUntil: "2099-01-01T00:00:00.000Z",
            ...input,
          },
        });
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(expected);
        const request = yield* Queue.take(h.requests);
        expect(h.registry.get(source)).toBe(initial);
        yield* Deferred.fail(request.reply, new Error("Remote rejected the action"));
        expect((yield* Effect.promise(() => result))._tag).toBe("Failure");
        expect(h.registry.get(h.visibleAtom)).toBe(initial);
      }),
  );

  it.effect("restamps snoozedAt when re-snoozing to the same wake time", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const earlierSnoozedAt = DateTime.makeUnsafe("2000-01-01T00:00:00.000Z");
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), {
        ...SNAPSHOT,
        threads: [{ ...SNAPSHOT.threads[0]!, snoozedUntil: FUTURE, snoozedAt: earlierSnoozedAt }],
      });
      const result = h.commands.snooze.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID, snoozedUntil: DateTime.formatIso(FUTURE) },
      });
      const snoozedAt = h.registry.get(h.visibleAtom)?.threads[0]?.snoozedAt;
      expect(DateTime.toEpochMillis(snoozedAt!)).toBeGreaterThan(
        DateTime.toEpochMillis(earlierSnoozedAt),
      );
      const request = yield* Queue.take(h.requests);
      yield* Deferred.succeed(request.reply, { sequence: 2 });
      expect((yield* Effect.promise(() => result))._tag).toBe("Success");
    }),
  );

  it.effect("keeps the preview after acknowledgement until the matching shell update arrives", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const result = h.commands.settle.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID },
      });
      const request = yield* Queue.take(h.requests);
      yield* Deferred.succeed(request.reply, { sequence: 3 });
      expect((yield* Effect.promise(() => result))._tag).toBe("Success");
      const changed = {
        ...SNAPSHOT,
        snapshotSequence: 2,
        threads: [{ ...SNAPSHOT.threads[0]!, title: "Renamed remotely" }],
      };
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), changed);
      expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject({
        title: "Renamed remotely",
        settledOverride: "settled",
      });
      const confirmed = {
        ...changed,
        snapshotSequence: 3,
        threads: [
          {
            ...changed.threads[0]!,
            settledOverride: "settled" as const,
            settledAt: DateTime.makeUnsafe("2026-09-12T12:00:00.000Z"),
          },
        ],
      };
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), confirmed);
      expect(h.registry.get(h.visibleAtom)).toBe(confirmed);
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), { ...SNAPSHOT, snapshotSequence: 4 });
      expect(h.registry.get(h.visibleAtom)?.threads[0]?.settledOverride).toBeNull();
    }),
  );

  it.effect(
    "shows a queued reverse action immediately and preserves it if the earlier action fails",
    () =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const settle = h.commands.settle.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID },
        });
        const first = yield* Queue.take(h.requests);
        const unsettle = h.commands.unsettle.run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID, reason: "user" },
        });
        expect(h.registry.get(h.visibleAtom)?.threads[0]?.settledOverride).toBe("active");
        yield* Deferred.fail(first.reply, new Error("Settle rejected"));
        yield* Effect.promise(() => settle);
        expect(h.registry.get(h.visibleAtom)?.threads[0]?.settledOverride).toBe("active");
        const second = yield* Queue.take(h.requests);
        expect(second.command.type).toBe("thread.unsettle");
        const confirmed = {
          ...SNAPSHOT,
          snapshotSequence: 2,
          threads: [{ ...SNAPSHOT.threads[0]!, settledOverride: "active" as const }],
        };
        h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), confirmed);
        yield* Deferred.succeed(second.reply, { sequence: 2 });
        yield* Effect.promise(() => unsettle);
        expect(h.registry.get(h.visibleAtom)).toBe(confirmed);
      }),
  );

  it.effect("isolates environments and does not restore a remotely removed thread", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const otherEnvironment = EnvironmentId.make("other-remote");
      const result = h.commands.settle.run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID },
      });
      const request = yield* Queue.take(h.requests);
      expect(h.registry.get(h.commands.snapshotAtom(otherEnvironment))).toBe(SNAPSHOT);
      const removed = { ...SNAPSHOT, snapshotSequence: 2, threads: [] };
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), removed);
      expect(h.registry.get(h.visibleAtom)?.threads).toEqual([]);
      yield* Deferred.fail(request.reply, new Error("Thread removed"));
      yield* Effect.promise(() => result);
      expect(h.registry.get(h.visibleAtom)).toBe(removed);
    }),
  );

  const undoableActions = ["settle", "snooze"] as const;

  it.effect.each(undoableActions)("restores a confirmed %s when a queued undo fails", (action) =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const parked =
        action === "settle" ? { settledOverride: "settled" as const } : { snoozedUntil: FUTURE };
      const awake = action === "settle" ? { settledOverride: "active" } : { snoozedUntil: null };
      const result = h.commands[action].run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID, snoozedUntil: "2099-01-01T00:00:00.000Z" },
      });
      const first = yield* Queue.take(h.requests);
      const undo = h.commands[action === "settle" ? "unsettle" : "unsnooze"].run(h.registry, {
        environmentId: ENVIRONMENT_ID,
        input: { threadId: THREAD_ID, reason: "user" },
      });
      expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(awake);
      yield* Deferred.succeed(first.reply, { sequence: 2 });
      expect((yield* Effect.promise(() => result))._tag).toBe("Success");
      expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(awake);
      const confirmed = {
        ...SNAPSHOT,
        snapshotSequence: 2,
        threads: [{ ...SNAPSHOT.threads[0]!, ...parked }],
      };
      h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), confirmed);
      expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(awake);
      const second = yield* Queue.take(h.requests);
      expect(second.command.type).toBe(action === "settle" ? "thread.unsettle" : "thread.unsnooze");
      yield* Deferred.fail(second.reply, new Error("Undo rejected"));
      expect((yield* Effect.promise(() => undo))._tag).toBe("Failure");
      expect(h.registry.get(h.visibleAtom)).toBe(confirmed);
    }),
  );

  it.effect.each(undoableActions)(
    "preserves a newer approval when the %s reply arrives after the shell",
    (action) =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const result = h.commands[action].run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID, snoozedUntil: "2099-01-01T00:00:00.000Z" },
        });
        const request = yield* Queue.take(h.requests);
        const newer = {
          ...SNAPSHOT,
          snapshotSequence: 3,
          threads: [{ ...SNAPSHOT.threads[0]!, pendingRuntimeRequest: APPROVAL }],
        };
        h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), newer);
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toBe(newer.threads[0]);
        yield* Deferred.succeed(request.reply, { sequence: 2 });
        expect((yield* Effect.promise(() => result))._tag).toBe("Success");
        expect(h.registry.get(h.visibleAtom)).toBe(newer);
      }),
  );

  it.effect.each(undoableActions)(
    "shows an accepted %s while the shell still has an old input request",
    (action) =>
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const stale = {
          ...SNAPSHOT,
          threads: [{ ...SNAPSHOT.threads[0]!, pendingRuntimeRequest: USER_INPUT }],
        };
        h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), stale);
        const result = h.commands[action].run(h.registry, {
          environmentId: ENVIRONMENT_ID,
          input: { threadId: THREAD_ID, snoozedUntil: "2099-01-01T00:00:00.000Z" },
        });
        const request = yield* Queue.take(h.requests);
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toBe(stale.threads[0]);
        yield* Deferred.succeed(request.reply, { sequence: 2 });
        expect((yield* Effect.promise(() => result))._tag).toBe("Success");
        expect(h.registry.get(h.visibleAtom)?.threads[0]).toMatchObject(
          action === "settle" ? { settledOverride: "settled" } : { snoozedUntil: FUTURE },
        );
        expect(h.registry.get(h.visibleAtom)?.threads[0]?.pendingRuntimeRequest).toBeNull();
        expect(h.registry.get(h.snapshotAtom(ENVIRONMENT_ID))).toBe(stale);
      }),
  );
});

describe("optimistic runtime request responses", () => {
  const responses = [
    ["respondToApproval", APPROVAL, { decision: "accept" }],
    ["respondToUserInput", USER_INPUT, { answers: { question: "answer" } }],
    ["dismissUserInput", USER_INPUT, {}],
  ] as const;
  const resolvedFields = {
    respondToApproval: { decision: "accept" },
    respondToUserInput: { answers: { question: "answer" } },
    dismissUserInput: { decision: "cancel" },
  } as const;

  type Harness = Effect.Success<ReturnType<typeof makeHarness>>;
  // The three commands take different inputs, so one table row drives all of them.
  const respond = (
    h: Harness,
    action: (typeof responses)[number][0],
    requestId: RuntimeRequestId,
    extra: Record<string, unknown>,
  ) =>
    h.commands[action].run(h.registry, {
      environmentId: ENVIRONMENT_ID,
      input: { threadId: THREAD_ID, requestId, ...extra },
    } as never);

  const setup = Effect.fn("TestThreadCommands.setupResponse")(function* (
    request: typeof APPROVAL | typeof USER_INPUT,
  ) {
    const h = yield* makeHarness();
    const shell = {
      ...SNAPSHOT,
      threads: [{ ...SNAPSHOT.threads[0]!, pendingRuntimeRequest: request }],
    };
    h.registry.set(h.snapshotAtom(ENVIRONMENT_ID), shell);
    const requestOf = () => {
      const state = h.registry.get(h.stateAtom);
      return AsyncResult.isSuccess(state) && Option.isSome(state.value.data)
        ? state.value.data.value.runtimeRequests.find((item) => item.id === request.id)
        : undefined;
    };
    return { h, shell, requestOf };
  });

  it.effect.each(responses)(
    "%s resolves the request before a delayed reply and restores it on rejection",
    ([action, request, extra]) =>
      Effect.gen(function* () {
        const { h, shell, requestOf } = yield* setup(request);
        const result = respond(h, action, request.id, extra);
        expect(requestOf()).toMatchObject({ status: "resolved", ...resolvedFields[action] });
        const sent = yield* Queue.take(h.requests);
        yield* Deferred.fail(sent.reply, new Error("Rejected"));
        expect((yield* Effect.promise(() => result))._tag).toBe("Failure");
        expect(h.registry.get(h.stateAtom)).toBe(h.registry.get(h.sourceStateAtom));
        expect(h.registry.get(h.visibleAtom)).toBe(shell);
      }),
  );

  it.effect.each(responses)(
    "%s stays resolved until the thread reaches the acknowledged sequence",
    ([action, request, extra]) =>
      Effect.gen(function* () {
        const { h, requestOf } = yield* setup(request);
        const result = respond(h, action, request.id, extra);
        const sent = yield* Queue.take(h.requests);
        yield* Deferred.succeed(sent.reply, { sequence: 5 });
        expect((yield* Effect.promise(() => result))._tag).toBe("Success");
        h.registry.set(h.sourceStateAtom, AsyncResult.success({ ...THREAD_STATE, sequence: 4 }));
        expect(requestOf()).toMatchObject({ status: "resolved" });
        const caughtUp = AsyncResult.success({ ...THREAD_STATE, sequence: 5 });
        h.registry.set(h.sourceStateAtom, caughtUp);
        expect(h.registry.get(h.stateAtom)).toBe(caughtUp);
      }),
  );

  it.effect.each(responses)(
    "%s leaves a request the server already cancelled alone when it fails",
    ([action, request, extra]) =>
      Effect.gen(function* () {
        const { h } = yield* setup(request);
        const result = respond(h, action, request.id, extra);
        const sent = yield* Queue.take(h.requests);
        const cancelled = AsyncResult.success({
          ...THREAD_STATE,
          sequence: 4,
          data: Option.map(THREAD_STATE.data, (projection) => ({
            ...projection,
            runtimeRequests: projection.runtimeRequests.map((item) =>
              item.id === request.id ? { ...item, status: "cancelled" as const } : item,
            ),
          })),
        });
        h.registry.set(h.sourceStateAtom, cancelled);
        yield* Deferred.fail(sent.reply, new Error("Request is not pending"));
        expect((yield* Effect.promise(() => result))._tag).toBe("Failure");
        expect(h.registry.get(h.stateAtom)).toBe(cancelled);
      }),
  );

  it.effect.each(responses)(
    "%s reuses the first response when the same request is answered twice",
    ([action, request, extra]) =>
      Effect.gen(function* () {
        const { h } = yield* setup(request);
        const first = respond(h, action, request.id, extra);
        const second = respond(h, action, request.id, extra);
        const sent = yield* Queue.take(h.requests);
        expect(Option.isNone(yield* Queue.poll(h.requests))).toBe(true);
        yield* Deferred.succeed(sent.reply, { sequence: 5 });
        const [firstResult, secondResult] = yield* Effect.promise(() =>
          Promise.all([first, second]),
        );
        expect(secondResult).toBe(firstResult);
      }),
  );
});
