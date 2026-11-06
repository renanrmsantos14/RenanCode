import type { SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import type {
  BackgroundDemand,
  ServerProvider,
  ServerProviderUsageLimits,
} from "@t3tools/contracts";
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
import {
  API_BASE,
  claudeResetCreditsToContract,
  readAccessToken,
  withClaudeHeaders,
} from "./claudeResetCredits.ts";
import { claudeUsageResponseToLimits, type ClaudeScopedLimitNames } from "./claudeUsageLimits.ts";

const POLL_INTERVAL_MS: Record<Exclude<BackgroundDemand, "none">, number> = {
  foreground: 60_000,
  background: 5 * 60_000,
};
// Re-check demand often so the first read after a client returns is not minutes late.
const TICK_INTERVAL = "5 seconds";
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
      HttpClientRequest.get(`${API_BASE}/api/oauth/usage`, {
        urlParams: { cedar_ember: "1" },
      }).pipe(withClaudeHeaders(token, version)),
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
  const resetCredits = claudeResetCreditsToContract(
    "cedar_ember" in body ? body.cedar_ember : undefined,
    nowMs,
  );
  return {
    _tag: "ok",
    limits: resetCredits ? { ...limits, resetCredits } : limits,
    names: nextNames,
  };
});

/** The rate limit belongs to the account, so its backoff is shared along with the read. */
interface SharedRead {
  readonly lock: Semaphore.Semaphore;
  cached: { readonly atMs: number; readonly read: UsageRead } | undefined;
  /** Survives a failed read, so a rate limited probe does not hide credits still on the account. */
  resetCredits: ServerProviderUsageLimits["resetCredits"];
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
      resetCredits: undefined,
      blockedUntilMs: 0,
      rateLimitStreak: 0,
    };
    sharedReads.set(configDir, shared);
  }
  return shared;
};

const isSignedOut = (read: UsageRead) =>
  read._tag === "noToken" || (read._tag === "failed" && read.reason === "signedOut");

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
  shared.blockedUntilMs = isSignedOut(read) ? nowMs + SIGNED_OUT_BACKOFF_MS : 0;
};

/** Every reader of an account goes through here, so the probe and the poller share one request and one backoff. */
const readSharedClaudeUsage = Effect.fn("readSharedClaudeUsage")(function* (
  shared: SharedRead,
  configDir: string,
  version: string,
  nowMs: number,
) {
  return yield* shared.lock.withPermits(1)(
    Effect.gen(function* () {
      const { cached } = shared;
      if (cached && (nowMs < shared.blockedUntilMs || nowMs - cached.atMs < SHARED_READ_TTL_MS)) {
        return cached.read;
      }
      const fresh = yield* readClaudeOAuthUsage(configDir, version, nowMs);
      shared.cached = { atMs: nowMs, read: fresh };
      if (fresh._tag === "ok") shared.resetCredits = fresh.limits.resetCredits;
      else if (isSignedOut(fresh)) shared.resetCredits = undefined;
      updateBackoff(shared, fresh, nowMs);
      return fresh;
    }),
  );
});

export const readClaudeResetCreditsShared = Effect.fn("readClaudeResetCreditsShared")(function* (
  configDir: string,
  version: string,
) {
  const nowMs = yield* Clock.currentTimeMillis;
  const shared = sharedReadFor(configDir);
  yield* readSharedClaudeUsage(shared, configDir, version, nowMs);
  return shared.resetCredits;
});

/** A redeemed credit outdates the cached read and any in flight; a backoff in force still stands. */
export const expireSharedClaudeUsage = (configDir: string) => {
  const shared = sharedReadFor(configDir);
  return shared.lock.withPermits(1)(
    Effect.sync(() => {
      if (shared.cached) shared.cached = { ...shared.cached, atMs: 0 };
    }),
  );
};

/**
 * One check per call; it reads only when the interval for the current demand has passed.
 * While backing off, the failed read that started it is served again.
 * Without a token (macOS, signed out files) nothing is recorded and the CLI probe stays the source.
 */
export const makeClaudeUsagePollTick = (input: {
  readonly configDir: string;
  readonly scopedLimitNames: Ref.Ref<ClaudeScopedLimitNames>;
  readonly getSnapshot: Effect.Effect<ServerProvider>;
  readonly demand: Effect.Effect<BackgroundDemand>;
  readonly record: NonNullable<ManagedServerProvider["recordUsageReading"]>;
}) => {
  const shared = sharedReadFor(input.configDir);
  let lastPollMs: number | undefined;
  return Effect.gen(function* () {
    const nowMs = yield* Clock.currentTimeMillis;
    const sinceLastPollMs = lastPollMs === undefined ? Infinity : nowMs - lastPollMs;
    if (sinceLastPollMs < POLL_INTERVAL_MS.foreground) return;
    const demand = yield* input.demand;
    if (demand === "none") return;
    const intervalMs = POLL_INTERVAL_MS[demand];
    if (sinceLastPollMs < intervalMs) return;
    const snapshot = yield* input.getSnapshot;
    if (!snapshot.enabled || !snapshot.version) return;
    lastPollMs = nowMs;
    const read = yield* readSharedClaudeUsage(shared, input.configDir, snapshot.version, nowMs);
    if (read._tag === "noToken") return;
    if (read._tag === "ok") {
      yield* Ref.set(input.scopedLimitNames, read.names);
      yield* input.record({ _tag: "ok", limits: read.limits });
      return;
    }
    yield* input.record({
      _tag: "failed",
      at: DateTime.formatIso(DateTime.makeUnsafe(nowMs)),
      reason: read.reason,
      retryAt: DateTime.formatIso(
        DateTime.makeUnsafe(Math.max(shared.blockedUntilMs, nowMs + intervalMs)),
      ),
    });
  });
};

export const startClaudeUsagePoller = Effect.fn("startClaudeUsagePoller")(function* (
  input: Parameters<typeof makeClaudeUsagePollTick>[0],
) {
  const tick = makeClaudeUsagePollTick(input);
  yield* tick.pipe(
    Effect.catchCause((cause) => Effect.logWarning("Claude usage poll failed", cause)),
    Effect.andThen(Effect.sleep(TICK_INTERVAL)),
    Effect.forever,
    Effect.forkScoped,
  );
});
