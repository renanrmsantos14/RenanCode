import { describe, expect, it } from "@effect/vitest";
import { ProviderThreadId, ThreadId } from "@t3tools/contracts";
import { KEEP_WARM_PING_TEXT } from "@t3tools/shared/promptCache";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as TestClock from "effect/testing/TestClock";

import * as CacheKeepWarmService from "./CacheKeepWarmService.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";

const NOW_MS = Date.parse("2026-10-19T12:00:00.000Z");
const MINUTE_MS = 60_000;
const HOUR = 60 * MINUTE_MS;
const threadId = ThreadId.make("warm-thread");
const providerThreadId = ProviderThreadId.make("provider-thread");

const setup = (options: { readonly driver?: string; readonly busy?: boolean } = {}) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(NOW_MS);
    const pings = yield* Queue.unbounded<string>();
    // The last request warmed the cache for 5 minutes.
    let expiresAtMs = NOW_MS + 5 * MINUTE_MS;
    let updatedAtMs = NOW_MS;
    const dependencies = Layer.mergeAll(
      Layer.mock(Orchestrator.OrchestratorV2)({
        dispatch: (command) =>
          Effect.gen(function* () {
            const now = yield* Clock.currentTimeMillis;
            // A ping turn reports fresh usage with a new expiry.
            updatedAtMs = now;
            expiresAtMs = now + 5 * MINUTE_MS;
            yield* Queue.offer(pings, "text" in command ? command.text : "");
            return { sequence: 1, storedEvents: [] };
          }),
      }),
      Layer.mock(ProjectionStore.ProjectionStoreV2)({
        getThread: () =>
          Effect.succeed({
            deletedAt: null,
            archivedAt: null,
            activeProviderThreadId: providerThreadId,
          } as never),
        getThreadRecords: () =>
          Effect.sync(
            () =>
              ({
                runs: options.busy ? [{ status: "running" }] : [],
                providerThreads: [{ id: providerThreadId, driver: options.driver ?? "codex" }],
                providerTurns: [
                  {
                    tokenUsage: {
                      usedTokens: 150_000,
                      promptCacheExpiresAt: DateTime.formatIso(DateTime.makeUnsafe(expiresAtMs)),
                      updatedAt: DateTime.formatIso(DateTime.makeUnsafe(updatedAtMs)),
                    },
                  },
                ],
              }) as never,
          ),
      }),
    );
    const service = yield* CacheKeepWarmService.make.pipe(Effect.provide(dependencies));
    return { service, pings };
  });

describe("CacheKeepWarmService", () => {
  it.effect("pings a minute before each expiry and stops at the deadline", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { service, pings } = yield* setup();
        const started = yield* service.start(threadId, 0.2);
        expect(started).toMatchObject({ active: true, pings: 0 });

        yield* TestClock.adjust(3 * MINUTE_MS);
        expect(yield* Queue.size(pings)).toBe(0);
        yield* TestClock.adjust(MINUTE_MS);
        expect(yield* Queue.take(pings)).toBe(KEEP_WARM_PING_TEXT);
        expect((yield* service.status(threadId)).pings).toBe(1);

        yield* TestClock.adjust(4 * MINUTE_MS);
        expect(yield* Queue.take(pings)).toBe(KEEP_WARM_PING_TEXT);

        // The next ping would land past the 12 minute deadline.
        yield* TestClock.adjust(10 * MINUTE_MS);
        expect(yield* Queue.size(pings)).toBe(0);
        expect(yield* service.status(threadId)).toMatchObject({ active: false });
      }),
    ),
  );

  it.effect("stops immediately on off", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { service, pings } = yield* setup();
        yield* service.start(threadId, 4);
        expect(yield* service.stop(threadId)).toMatchObject({ active: false });
        yield* TestClock.adjust(HOUR);
        expect(yield* Queue.size(pings)).toBe(0);
      }),
    ),
  );

  it.effect.each([
    { name: "a run is active", options: { busy: true } },
    { name: "the provider reports no cache", options: { driver: "kiro" } },
  ] as const)("sends no ping when $name", ({ options }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const { service, pings } = yield* setup(options);
        yield* service.start(threadId, 4);
        yield* TestClock.adjust(HOUR);
        expect(yield* Queue.size(pings)).toBe(0);
      }),
    ),
  );
});
