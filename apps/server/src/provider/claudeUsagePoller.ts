import type { SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import type { ServerProvider, ServerProviderUsageLimits } from "@t3tools/contracts";
import type { ManagedServerProvider } from "@t3tools/provider-core/server/snapshot";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { parseRetryAfterMillis } from "../cloud/relayResponse.ts";
import { API_BASE, readAccessToken, withClaudeHeaders } from "./claudeResetCredits.ts";
import { claudeUsageResponseToLimits, type ClaudeScopedLimitNames } from "./claudeUsageLimits.ts";

const POLL_INTERVAL = "60 seconds";
// Re-check the demand gate often so the first read after a client reconnects is not a minute late.
const IDLE_INTERVAL = "5 seconds";
// Instances that share a config directory share one account, so one request serves them all.
const SHARED_READ_TTL_MS = 30_000;
const RATE_LIMIT_BACKOFF_START_MS = 2 * 60_000;
const RATE_LIMIT_BACKOFF_MAX_MS = 15 * 60_000;
const RETRY_AFTER_MAX_MS = 60 * 60_000;
// The server never refreshes the token, so asking again sooner than the CLI probe TTL is noise.
const SIGNED_OUT_BACKOFF_MS = 5 * 60_000;

type FailureReason = NonNullable<ServerProviderUsageLimits["lastError"]>["reason"];

type UsageRead =
  | {
      readonly _tag: "ok";
      readonly limits: ServerProviderUsageLimits;
      readonly names: ClaudeScopedLimitNames;
    }
  | { readonly _tag: "noToken" }
  | { readonly _tag: "failed"; readonly reason: FailureReason; readonly retryAfterMs?: number };

const failed = (reason: FailureReason, retryAfterMs?: number): UsageRead => ({
  _tag: "failed",
  reason,
  ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
});

/**
 * Reads the OAuth usage endpoint. It is undocumented, so the body is decoded loosely
 * and anything that yields no window counts as a failed read.
 * Utilization is 0-100 like `get_usage` (confirmed against a real 200 response);
 * `resets_at` carries six fractional digits and a `+00:00` offset.
 */
const readClaudeOAuthUsage = Effect.fn("readClaudeOAuthUsage")(function* (
  configDir: string,
  version: string,
  nowMs: number,
): Effect.fn.Return<UsageRead, never, HttpClient.HttpClient | FileSystem.FileSystem | Path.Path> {
  const token = yield* readAccessToken(configDir).pipe(
    Effect.orElseSucceed(() => "unreadable" as const),
  );
  if (token === undefined) return { _tag: "noToken" };
  if (token === "unreadable") return failed("requestFailed");
  const client = yield* HttpClient.HttpClient;
  const response = yield* client
    .execute(
      HttpClientRequest.get(`${API_BASE}/api/oauth/usage`).pipe(withClaudeHeaders(token, version)),
    )
    .pipe(
      Effect.timeout("10 seconds"),
      Effect.orElseSucceed(() => undefined),
    );
  if (!response) return failed("requestFailed");
  if (response.status === 429) {
    return failed(
      "rateLimited",
      parseRetryAfterMillis(response.headers["retry-after"], nowMs, RETRY_AFTER_MAX_MS),
    );
  }
  if (response.status === 401 || response.status === 403) return failed("signedOut");
  if (response.status < 200 || response.status >= 300) return failed("requestFailed");
  const body = yield* HttpClientResponse.schemaBodyJson(Schema.Unknown)(response).pipe(
    Effect.timeout("10 seconds"),
    Effect.orElseSucceed(() => undefined),
  );
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return failed("requestFailed");
  }
  const { limits, names: nextNames } = claudeUsageResponseToLimits({
    response: {
      rate_limits_available: true,
      rate_limits: body as NonNullable<SDKControlGetUsageResponse["rate_limits"]>,
    },
    checkedAt: DateTime.formatIso(DateTime.makeUnsafe(nowMs)),
  });
  if (limits.unavailable || limits.windows.length === 0) return failed("requestFailed");
  return { _tag: "ok", limits, names: nextNames };
});

/** The rate limit belongs to the account, so its backoff is shared along with the read. */
interface SharedRead {
  readonly lock: Semaphore.Semaphore;
  cached: { readonly atMs: number; readonly read: UsageRead } | undefined;
  blockedUntilMs: number;
  rateLimitStreak: number;
}
const sharedReads = new Map<string, SharedRead>();

const sharedReadFor = (configDir: string): SharedRead => {
  let shared = sharedReads.get(configDir);
  if (!shared) {
    shared = {
      lock: Semaphore.makeUnsafe(1),
      cached: undefined,
      blockedUntilMs: 0,
      rateLimitStreak: 0,
    };
    sharedReads.set(configDir, shared);
  }
  return shared;
};

const updateBackoff = (shared: SharedRead, read: UsageRead, nowMs: number) => {
  if (read._tag === "failed" && read.reason === "rateLimited") {
    const delay =
      read.retryAfterMs ??
      Math.min(
        RATE_LIMIT_BACKOFF_MAX_MS,
        RATE_LIMIT_BACKOFF_START_MS * 2 ** shared.rateLimitStreak,
      );
    shared.blockedUntilMs = nowMs + delay;
    shared.rateLimitStreak += 1;
    return;
  }
  shared.rateLimitStreak = 0;
  const signedOut =
    read._tag === "noToken" || (read._tag === "failed" && read.reason === "signedOut");
  shared.blockedUntilMs = signedOut ? nowMs + SIGNED_OUT_BACKOFF_MS : 0;
};

/**
 * One poll per call. While backing off, the failed read that started it is served again.
 * Without a token (macOS, signed out files) nothing is recorded and the CLI probe stays the source.
 * Resolves to false while nobody is watching or the CLI version is unknown, so the loop re-checks sooner.
 */
export const makeClaudeUsagePollTick = (input: {
  readonly configDir: string;
  readonly scopedLimitNames: Ref.Ref<ClaudeScopedLimitNames>;
  readonly getSnapshot: Effect.Effect<ServerProvider>;
  /** Same demand gate as the provider-status refresh: false while no client is watching. */
  readonly shouldRun: Effect.Effect<boolean>;
  readonly record: NonNullable<ManagedServerProvider["recordUsageReading"]>;
}) => {
  const shared = sharedReadFor(input.configDir);
  return Effect.gen(function* () {
    if (!(yield* input.shouldRun)) return false;
    const snapshot = yield* input.getSnapshot;
    if (!snapshot.enabled) return true;
    if (!snapshot.version) return false;
    const { version } = snapshot;
    const nowMs = yield* Clock.currentTimeMillis;
    const read = yield* shared.lock.withPermits(1)(
      Effect.gen(function* () {
        const { cached } = shared;
        if (cached && (nowMs < shared.blockedUntilMs || nowMs - cached.atMs < SHARED_READ_TTL_MS)) {
          return cached.read;
        }
        const fresh = yield* readClaudeOAuthUsage(input.configDir, version, nowMs);
        shared.cached = { atMs: nowMs, read: fresh };
        updateBackoff(shared, fresh, nowMs);
        return fresh;
      }),
    );
    if (read._tag === "noToken") return true;
    if (read._tag === "ok") {
      yield* Ref.set(input.scopedLimitNames, read.names);
      yield* input.record({ _tag: "ok", limits: read.limits });
      return true;
    }
    yield* input.record({
      _tag: "failed",
      at: DateTime.formatIso(DateTime.makeUnsafe(nowMs)),
      reason: read.reason,
    });
    return true;
  });
};

export const startClaudeUsagePoller = Effect.fn("startClaudeUsagePoller")(function* (
  input: Parameters<typeof makeClaudeUsagePollTick>[0],
) {
  const tick = makeClaudeUsagePollTick(input);
  yield* tick.pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Claude usage poll failed", cause).pipe(Effect.as(true)),
    ),
    Effect.flatMap((watched) => Effect.sleep(watched ? POLL_INTERVAL : IDLE_INTERVAL)),
    Effect.forever,
    Effect.forkScoped,
  );
});
