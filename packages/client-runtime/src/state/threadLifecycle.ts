import type {
  EnvironmentId,
  OrchestrationV2RuntimeRequest,
  OrchestrationV2ShellSnapshot,
  OrchestrationV2ThreadShell,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import { AsyncResult, Atom, type AtomRegistry } from "effect/reactivity";

import { arrayElementsEqual, parseThreadKey, threadKey } from "./entities.ts";
import type { AtomCommand } from "./runtime.ts";
import type { EnvironmentThreadState } from "./threadState.ts";

interface PendingThreadUpdate {
  readonly threadId: ThreadId;
  readonly apply: (thread: OrchestrationV2ThreadShell) => OrchestrationV2ThreadShell;
  sequence?: number;
}

export function createOptimisticThreadLifecycle(
  sourceSnapshotAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<OrchestrationV2ShellSnapshot | null>,
) {
  const pendingAtom = Atom.family((_environmentId: EnvironmentId) =>
    Atom.make<ReadonlyArray<PendingThreadUpdate>>([]).pipe(Atom.keepAlive),
  );
  const snapshotAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get) => {
      const snapshot = get(sourceSnapshotAtom(environmentId));
      const pending = get(pendingAtom(environmentId));
      if (snapshot === null || pending.length === 0) return snapshot;
      const byThread = new Map<ThreadId, PendingThreadUpdate[]>();
      for (const update of pending) {
        if (update.sequence !== undefined && update.sequence <= snapshot.snapshotSequence) continue;
        const updates = byThread.get(update.threadId) ?? [];
        updates.push(update);
        byThread.set(update.threadId, updates);
      }
      if (byThread.size === 0) return snapshot;
      return {
        ...snapshot,
        threads: snapshot.threads.map((thread) =>
          (byThread.get(thread.id) ?? []).reduce(
            (current, update) => update.apply(current),
            thread,
          ),
        ),
      };
    }),
  );

  // Until the durable snapshot catches up, an older pending update can still replace what shows.
  const pendingThreadIdsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlySet<ThreadId> =>
        new Set(get(pendingAtom(environmentId)).map((update) => update.threadId)),
    ),
  );

  function wrap<Input extends { readonly threadId: ThreadId }, E>(
    command: AtomCommand<
      { readonly environmentId: EnvironmentId; readonly input: Input },
      { readonly sequence: number },
      E
    >,
    apply: (
      thread: OrchestrationV2ThreadShell,
      input: Input,
      now: DateTime.Utc,
      accepted: boolean,
    ) => OrchestrationV2ThreadShell,
  ): typeof command {
    return {
      label: command.label,
      run: (registry, target) =>
        Effect.suspend(() => {
          const now = DateTime.nowUnsafe();
          const update: PendingThreadUpdate = {
            threadId: target.input.threadId,
            apply: (thread) => apply(thread, target.input, now, update.sequence !== undefined),
          };
          return runWithPendingUpdate(
            registry,
            pendingAtom(target.environmentId),
            sourceSnapshotAtom(target.environmentId),
            (snapshot, sequence) => snapshot === null || snapshot.snapshotSequence >= sequence,
            update,
            command.run(registry, target),
          );
        }),
    };
  }

  return { snapshotAtom, pendingThreadIdsAtom, wrap };
}

/**
 * Shows `update` while `run` is in flight. A rejected command drops it; an accepted one keeps it
 * until the source reports the command's commit sequence, so the change never flickers back.
 */
function runWithPendingUpdate<
  Item extends { sequence?: number },
  Source,
  A extends { readonly sequence: number },
  E,
>(
  registry: AtomRegistry.AtomRegistry,
  pendingAtom: Atom.Writable<ReadonlyArray<Item>>,
  sourceAtom: Atom.Atom<Source>,
  caughtUp: (source: Source, sequence: number) => boolean,
  update: Item,
  run: Effect.Effect<A, E>,
): Effect.Effect<A, E> {
  const remove = () =>
    registry.update(pendingAtom, (current) => current.filter((item) => item !== update));
  const confirm = (sequence: number) => {
    update.sequence = sequence;
    registry.update(pendingAtom, (current) => [...current]);
    const reconcile = (source: Source) => {
      if (caughtUp(source, sequence)) {
        remove();
        unsubscribe();
      }
    };
    const unsubscribe = registry.subscribe(sourceAtom, reconcile);
    reconcile(registry.get(sourceAtom));
  };
  return Effect.suspend(() => {
    registry.update(pendingAtom, (current) => [...current, update]);
    return run.pipe(
      Effect.onExit((exit) =>
        Effect.sync(() => (Exit.isSuccess(exit) ? confirm(exit.value.sequence) : remove())),
      ),
    );
  });
}

type RuntimeRequestResolution = Partial<
  Pick<OrchestrationV2RuntimeRequest, "decision" | "feedback" | "answers">
>;

interface PendingRuntimeResponse {
  readonly requestId: RuntimeRequestId;
  readonly resolution: RuntimeRequestResolution;
  readonly now: DateTime.Utc;
  sequence?: number;
}

function resolveRuntimeRequests(
  requests: ReadonlyArray<OrchestrationV2RuntimeRequest>,
  active: ReadonlyArray<PendingRuntimeResponse>,
): ReadonlyArray<OrchestrationV2RuntimeRequest> {
  let changed = false;
  const next = requests.map((request) => {
    if (request.status !== "pending") return request;
    const response = active.find((candidate) => candidate.requestId === request.id);
    if (response === undefined) return request;
    changed = true;
    return {
      ...request,
      status: "resolved" as const,
      resolvedAt: response.now,
      ...response.resolution,
    };
  });
  return changed ? next : requests;
}

/**
 * Shows a response to an agent runtime request as soon as it is sent, by resolving the request in
 * the thread state, until the server's commit lands or the command is rejected.
 */
export function createOptimisticRuntimeResponses<E>(
  sourceStateAtom: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
  ) => Atom.Atom<AsyncResult.AsyncResult<EnvironmentThreadState, E>>,
) {
  const pendingAtom = Atom.family((_key: string) =>
    Atom.make<ReadonlyArray<PendingRuntimeResponse>>([]).pipe(Atom.keepAlive),
  );
  const stateAtom = Atom.family((key: string) => {
    const ref = parseThreadKey(key);
    let previousRequests: ReadonlyArray<OrchestrationV2RuntimeRequest> | undefined;
    let previousActive: ReadonlyArray<PendingRuntimeResponse> = [];
    let previousResolved: ReadonlyArray<OrchestrationV2RuntimeRequest> = [];
    let previousOutput:
      | {
          readonly source: AsyncResult.AsyncResult<EnvironmentThreadState, E>;
          readonly value: AsyncResult.AsyncResult<EnvironmentThreadState, E>;
        }
      | undefined;
    return Atom.make((get) => {
      const result = get(sourceStateAtom(ref.environmentId, ref.threadId));
      const pending = get(pendingAtom(key));
      if (pending.length === 0 || !AsyncResult.isSuccess(result)) return result;
      const state = result.value;
      if (Option.isNone(state.data)) return result;
      const projection = state.data.value;
      const active = pending.filter(
        (response) => response.sequence === undefined || response.sequence > state.sequence,
      );
      if (
        previousRequests !== projection.runtimeRequests ||
        !arrayElementsEqual(previousActive, active)
      ) {
        previousRequests = projection.runtimeRequests;
        previousActive = active;
        previousResolved = resolveRuntimeRequests(projection.runtimeRequests, active);
        previousOutput = undefined;
      }
      if (previousResolved === projection.runtimeRequests) return result;
      // Keeps the projection's identity when only a pending entry changed, so readers do not re-render.
      if (previousOutput?.source !== result) {
        previousOutput = {
          source: result,
          value: AsyncResult.success(
            { ...state, data: Option.some({ ...projection, runtimeRequests: previousResolved }) },
            { waiting: result.waiting },
          ),
        };
      }
      return previousOutput.value;
    }).pipe(Atom.setIdleTTL(0), Atom.withLabel(`environment-thread-state-responses:${key}`));
  });

  function wrap<
    Input extends { readonly threadId: ThreadId; readonly requestId: RuntimeRequestId },
    E2,
  >(
    command: AtomCommand<
      { readonly environmentId: EnvironmentId; readonly input: Input },
      { readonly sequence: number },
      E2
    >,
    resolution: (input: Input) => RuntimeRequestResolution,
  ): typeof command {
    const inFlight = new Map<string, Deferred.Deferred<{ readonly sequence: number }, E2>>();
    return {
      label: command.label,
      run: (registry, target) =>
        Effect.suspend(() => {
          const key = threadKey({
            environmentId: target.environmentId,
            threadId: target.input.threadId,
          });
          const flightKey = `${key}:${target.input.requestId}`;
          // A second tap on the same request reuses the first response instead of dispatching again.
          const existing = inFlight.get(flightKey);
          if (existing !== undefined) return Deferred.await(existing);
          const shared = Deferred.makeUnsafe<{ readonly sequence: number }, E2>();
          inFlight.set(flightKey, shared);
          const response: PendingRuntimeResponse = {
            requestId: target.input.requestId,
            resolution: resolution(target.input),
            now: DateTime.nowUnsafe(),
          };
          return runWithPendingUpdate(
            registry,
            pendingAtom(key),
            sourceStateAtom(target.environmentId, target.input.threadId),
            // A failed thread shows no overlay, so holding its subscription open would only leak it.
            (source, sequence) =>
              AsyncResult.isFailure(source) ||
              (AsyncResult.isSuccess(source) &&
                (source.value.status === "deleted" || source.value.sequence >= sequence)),
            response,
            command.run(registry, target),
          ).pipe(
            Effect.onExit((exit) =>
              Effect.sync(() => inFlight.delete(flightKey)).pipe(
                Effect.andThen(Deferred.done(shared, exit)),
              ),
            ),
          );
        }),
    };
  }

  return {
    stateAtom: (environmentId: EnvironmentId, threadId: ThreadId) =>
      stateAtom(threadKey({ environmentId, threadId })),
    wrap,
  };
}
