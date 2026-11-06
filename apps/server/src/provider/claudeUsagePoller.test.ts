import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import type { ServerProvider } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";
import { expect } from "vite-plus/test";

import { makeClaudeUsagePollTick } from "./claudeUsagePoller.ts";

const START = Date.parse("2026-09-22T12:00:00.000Z");
const MINUTE = 60_000;
const good = {
  five_hour: { utilization: null, resets_at: null },
  seven_day: { utilization: 41, resets_at: "2026-09-26T11:00:00Z" },
};

const setup = (input: {
  readonly responses: ReadonlyArray<{
    status: number;
    body: unknown;
    headers?: Record<string, string>;
    /** Sends headers, then never finishes the body; completes once the body is being read. */
    hangBody?: Deferred.Deferred<void>;
  }>;
  readonly platform?: "linux" | "darwin";
  readonly shouldRun?: boolean;
  /** Reuse another instance's config directory (same account). */
  readonly configDir?: string;
  readonly snapshot?: Partial<ServerProvider>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const configDir = input.configDir ?? (yield* fs.makeTempDirectoryScoped());
    if (!input.configDir) {
      yield* fs.writeFileString(
        path.join(configDir, ".credentials.json"),
        '{"claudeAiOauth":{"accessToken":"oauth-token"}}',
      );
    }
    yield* TestClock.setTime(START);
    const requests = yield* Ref.make(0);
    const recorded = yield* Ref.make<Array<unknown>>([]);
    const client = HttpClient.make((request) =>
      Ref.getAndUpdate(requests, (count) => count + 1).pipe(
        Effect.map((index) => {
          const next = input.responses[Math.min(index, input.responses.length - 1)]!;
          const { hangBody } = next;
          return HttpClientResponse.fromWeb(
            request,
            hangBody
              ? new Response(
                  new ReadableStream(
                    {
                      pull: () => {
                        Deferred.doneUnsafe(hangBody, Effect.void);
                        return new Promise(() => {});
                      },
                    },
                    { highWaterMark: 0 },
                  ),
                )
              : Response.json(next.body, { status: next.status, headers: next.headers ?? {} }),
          );
        }),
      ),
    );
    const names = yield* Ref.make({ overageIncluded: undefined as string | undefined });
    const tick = makeClaudeUsagePollTick({
      configDir,
      scopedLimitNames: names,
      getSnapshot: Effect.succeed({
        enabled: true,
        version: "2.1.0",
        ...input.snapshot,
      } as ServerProvider),
      shouldRun: Effect.succeed(input.shouldRun ?? true),
      record: (reading) => Ref.update(recorded, (all) => [...all, reading]),
    });
    const run = tick.pipe(
      Effect.provideService(HostProcess.Platform, input.platform ?? "linux"),
      Effect.provideService(HttpClient.HttpClient, client),
    );
    return { run, requests, recorded, configDir };
  });

effectIt.layer(NodeServices.layer)("Claude usage poller", (it) => {
  it.effect("publishes the windows of a good read, with an unstarted session at 0%", () =>
    Effect.gen(function* () {
      const { run, recorded } = yield* setup({ responses: [{ status: 200, body: good }] });
      yield* run;
      expect(yield* Ref.get(recorded)).toEqual([
        {
          _tag: "ok",
          limits: {
            checkedAt: "2026-09-22T12:00:00.000Z",
            windows: [
              expect.objectContaining({ id: "five_hour", usedPercent: 0 }),
              expect.objectContaining({
                id: "seven_day",
                usedPercent: 41,
                resetsAt: "2026-09-26T11:00:00.000Z",
              }),
            ],
          },
        },
      ]);
    }),
  );

  it.effect("records signedOut on 401 and waits before asking again", () =>
    Effect.gen(function* () {
      const { run, requests, recorded } = yield* setup({
        responses: [{ status: 401, body: {} }],
      });
      yield* run;
      yield* TestClock.adjust(MINUTE);
      yield* run;
      expect(yield* Ref.get(requests)).toBe(1);
      yield* TestClock.adjust(4 * MINUTE);
      yield* run;
      expect(yield* Ref.get(requests)).toBe(2);
      expect(yield* Ref.get(recorded)).toEqual([
        { _tag: "failed", at: "2026-09-22T12:00:00.000Z", reason: "signedOut" },
        { _tag: "failed", at: "2026-09-22T12:01:00.000Z", reason: "signedOut" },
        { _tag: "failed", at: "2026-09-22T12:05:00.000Z", reason: "signedOut" },
      ]);
    }),
  );

  it.effect("stops on 429 until Retry-After, then backs off exponentially without it", () =>
    Effect.gen(function* () {
      const withHeader = yield* setup({
        responses: [{ status: 429, body: {}, headers: { "retry-after": "180" } }],
      });
      yield* withHeader.run;
      yield* TestClock.adjust(2 * MINUTE);
      yield* withHeader.run;
      expect(yield* Ref.get(withHeader.requests)).toBe(1);
      yield* TestClock.adjust(MINUTE);
      yield* withHeader.run;
      expect(yield* Ref.get(withHeader.requests)).toBe(2);

      const without = yield* setup({ responses: [{ status: 429, body: {} }] });
      yield* without.run;
      yield* TestClock.adjust(2 * MINUTE);
      yield* without.run;
      yield* TestClock.adjust(3 * MINUTE);
      yield* without.run;
      expect(yield* Ref.get(without.requests)).toBe(2);
      expect(yield* Ref.get(without.recorded)).toEqual([
        { _tag: "failed", at: "2026-09-22T12:00:00.000Z", reason: "rateLimited" },
        { _tag: "failed", at: "2026-09-22T12:02:00.000Z", reason: "rateLimited" },
        { _tag: "failed", at: "2026-09-22T12:05:00.000Z", reason: "rateLimited" },
      ]);
    }),
  );

  it.effect("treats a body with no readable window as a failed read", () =>
    Effect.gen(function* () {
      const { run, recorded } = yield* setup({
        responses: [{ status: 200, body: { unexpected: true } }],
      });
      yield* run;
      expect(yield* Ref.get(recorded)).toEqual([
        { _tag: "failed", at: "2026-09-22T12:00:00.000Z", reason: "requestFailed" },
      ]);
    }),
  );

  it.effect("gives up on a body that never finishes, so the read lock is released", () =>
    Effect.gen(function* () {
      const reading = yield* Deferred.make<void>();
      const { run, recorded } = yield* setup({
        responses: [{ status: 200, body: null, hangBody: reading }],
      });
      const fiber = yield* Effect.forkChild(run);
      yield* Deferred.await(reading);
      yield* TestClock.adjust("10 seconds");
      yield* Fiber.join(fiber);
      expect(yield* Ref.get(recorded)).toEqual([
        { _tag: "failed", at: "2026-09-22T12:00:00.000Z", reason: "requestFailed" },
      ]);
    }),
  );

  it.effect("reads nothing while no client is watching, and reads at once when one is", () =>
    Effect.gen(function* () {
      const idle = yield* setup({ responses: [{ status: 200, body: good }], shouldRun: false });
      expect(yield* idle.run).toBe(false);
      expect([yield* Ref.get(idle.requests), yield* Ref.get(idle.recorded)]).toEqual([0, []]);
      const watched = yield* setup({ responses: [{ status: 200, body: good }] });
      expect(yield* watched.run).toBe(true);
      expect(yield* Ref.get(watched.requests)).toBe(1);
    }),
  );

  it.effect("serves two instances on the same config directory with one request", () =>
    Effect.gen(function* () {
      const first = yield* setup({ responses: [{ status: 200, body: good }] });
      const second = yield* setup({
        responses: [{ status: 200, body: good }],
        configDir: first.configDir,
      });
      yield* first.run;
      yield* second.run;
      expect(yield* Ref.get(first.requests)).toBe(1);
      expect(yield* Ref.get(second.requests)).toBe(0);
      expect(yield* Ref.get(second.recorded)).toHaveLength(1);
    }),
  );

  it.effect("holds every instance on a config directory through one instance's 429", () =>
    Effect.gen(function* () {
      const first = yield* setup({
        responses: [{ status: 429, body: {}, headers: { "retry-after": "180" } }],
      });
      const second = yield* setup({
        responses: [{ status: 200, body: good }],
        configDir: first.configDir,
      });
      yield* first.run;
      yield* TestClock.adjust(MINUTE);
      yield* second.run;
      expect(yield* Ref.get(second.requests)).toBe(0);
      expect(yield* Ref.get(second.recorded)).toEqual([
        { _tag: "failed", at: "2026-09-22T12:01:00.000Z", reason: "rateLimited" },
      ]);
      yield* TestClock.adjust(2 * MINUTE);
      yield* second.run;
      expect(yield* Ref.get(second.requests)).toBe(1);
    }),
  );

  it.effect("sends no request on macOS, when disabled, or before the version is known", () =>
    Effect.gen(function* () {
      for (const options of [
        { platform: "darwin" as const },
        { snapshot: { enabled: false } },
        { snapshot: { version: null } },
      ]) {
        const { run, requests, recorded } = yield* setup({
          responses: [{ status: 200, body: good }],
          ...options,
        });
        yield* run;
        expect([yield* Ref.get(requests), yield* Ref.get(recorded)]).toEqual([0, []]);
      }
    }),
  );
});
