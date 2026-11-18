import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";

/** Counts the turns still running on one provider instance, so a replaced instance can wait for them. */
export interface TurnLeases {
  /** Takes a lease. The returned effect gives it back and must run exactly once. */
  readonly acquire: Effect.Effect<Effect.Effect<void>>;
  readonly hasActive: Effect.Effect<boolean>;
  /** Resumes once no lease is held. */
  readonly whenIdle: Effect.Effect<void>;
  /** Marks the instance replaced and drains the sessions that hold no turn. */
  readonly retire: Effect.Effect<void>;
  readonly isRetired: Effect.Effect<boolean>;
  /** Registers a session's drain. The returned effect unregisters it. */
  readonly enroll: (drain: Effect.Effect<void>) => Effect.Effect<Effect.Effect<void>>;
}

export const makeTurnLeases = (): TurnLeases => {
  let active = 0;
  let idle: Deferred.Deferred<void> | undefined;
  let retired = false;
  const drains = new Set<Effect.Effect<void>>();
  const give = Effect.suspend(() => {
    active--;
    if (active > 0 || idle === undefined) return Effect.void;
    const waiting = idle;
    idle = undefined;
    return Deferred.succeed(waiting, undefined);
  });
  // A session on the retired instance can take a lease between the wake-up and the caller's close,
  // so re-check after every wake-up.
  const whenIdle: Effect.Effect<void> = Effect.suspend(() => {
    if (active === 0) return Effect.void;
    idle ??= Deferred.makeUnsafe<void>();
    return Deferred.await(idle).pipe(Effect.andThen(whenIdle));
  });
  return {
    acquire: Effect.sync(() => {
      active++;
      return give;
    }),
    hasActive: Effect.sync(() => active > 0),
    whenIdle,
    retire: Effect.suspend(() => {
      retired = true;
      return Effect.all([...drains], { discard: true });
    }),
    isRetired: Effect.sync(() => retired),
    enroll: (drain) =>
      Effect.sync(() => {
        drains.add(drain);
        return Effect.sync(() => {
          drains.delete(drain);
        });
      }),
  };
};

const turnKey = (providerThreadId: string, runOrdinal: number) =>
  `${providerThreadId}:${runOrdinal}`;

/**
 * Holds a lease from `startTurn` until the turn's terminal event. A session that ends first (stop,
 * crash, release) gives back what it still holds, so a lost terminal event cannot pin the instance.
 */
export const trackTurns = (
  adapter: ProviderAdapter.ProviderAdapterV2["Service"],
  leases: TurnLeases,
): ProviderAdapter.ProviderAdapterV2["Service"] => ({
  ...adapter,
  openSession: Effect.fn("ProviderTurnLeases.openSession")(function* (
    input: Parameters<ProviderAdapter.ProviderAdapterV2["Service"]["openSession"]>[0],
  ) {
    // The runtime lives in a child scope so a retired instance can end it without the manager's help.
    const inner = yield* Scope.fork(yield* Scope.Scope);
    const runtime = yield* adapter
      .openSession(input)
      .pipe(Effect.provideService(Scope.Scope, inner));
    const held = new Map<string, Effect.Effect<void>>();
    const end = (key: string) =>
      Effect.suspend(() => {
        const give = held.get(key);
        held.delete(key);
        return give ?? Effect.void;
      });
    // A replaced instance's sessions end with their last turn, so no new turn runs on the old config.
    const drainIfIdle = Effect.suspend(() =>
      held.size === 0 ? Scope.close(inner, Exit.void) : Effect.void,
    );
    const settle = Effect.flatMap(leases.isRetired, (retired) =>
      retired ? drainIfIdle : Effect.void,
    );
    const unenroll = yield* leases.enroll(drainIfIdle);
    yield* Effect.addFinalizer(() =>
      Effect.suspend(() => {
        const all = [...held.values()];
        held.clear();
        return unenroll.pipe(Effect.andThen(Effect.all(all, { discard: true })));
      }),
    );
    // The drain waits for the next pull, after the terminal event has been handled downstream.
    const watch = <E>(events: Stream.Stream<ProviderAdapter.ProviderAdapterV2Event, E>) =>
      events.pipe(
        Stream.flatMap((event): Stream.Stream<ProviderAdapter.ProviderAdapterV2Event> =>
          event.type === "turn.terminal"
            ? Stream.concat(
                Stream.fromEffectDrain(end(turnKey(event.providerThreadId, event.runOrdinal))),
                Stream.concat(Stream.make(event), Stream.fromEffectDrain(settle)),
              )
            : Stream.make(event),
        ),
      );
    return {
      ...runtime,
      events: watch(runtime.events),
      ...(runtime.subscribeEvents === undefined
        ? {}
        : {
            subscribeEvents: runtime.subscribeEvents.pipe(
              Effect.map((subscription) => ({
                ...subscription,
                events: watch(subscription.events),
              })),
            ),
          }),
      startTurn: (turn) => {
        const key = turnKey(turn.providerThread.id, turn.runOrdinal);
        return Effect.suspend(() =>
          held.has(key)
            ? Effect.void
            : leases.acquire.pipe(
                Effect.map((give) => {
                  held.set(key, give);
                }),
              ),
        ).pipe(
          Effect.andThen(runtime.startTurn(turn)),
          Effect.onError(() => end(key).pipe(Effect.andThen(settle))),
        );
      },
    };
  }),
});
