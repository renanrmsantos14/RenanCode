import type { ProviderDriverKind } from "@t3tools/contracts";

export const COLD_CACHE_WARNING_MIN_TOKENS = 100_000;

export const KEEP_WARM_DEFAULT_HOURS = 4;
export const KEEP_WARM_MAX_HOURS = 8;

/** How long before the cache expires a keep-warm ping goes out. */
export const KEEP_WARM_LEAD_MS = 60_000;

/** Exact text of a keep-warm ping; the timeline hides server-created messages with this text. */
export const KEEP_WARM_PING_TEXT =
  "[keep-warm] Cache keep-alive ping. Reply with the single word: ok";

const FALLBACK_TTL_MS = 5 * 60_000;
const CLAUDE_FALLBACK_TTL_MS = 70 * 60_000;

/** Cursor reports cache usage per account and Kiro not at all, so neither supports cold-cache features. */
export function supportsPromptCacheFeatures(
  driver: ProviderDriverKind | string | null | undefined,
) {
  return driver !== null && driver !== undefined && driver !== "cursor" && driver !== "kiro";
}

/** TTL used when the provider did not report one. */
export function fallbackPromptCacheTtlMs(driver: ProviderDriverKind | string): number {
  return driver === "claudeAgent" ? CLAUDE_FALLBACK_TTL_MS : FALLBACK_TTL_MS;
}
