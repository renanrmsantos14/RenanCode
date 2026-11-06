import type {
  ProviderUsageLimitsUpdate,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";

const WINDOW_KIND_ORDER: Record<ServerProviderUsageWindow["kind"], number> = {
  session: 0,
  weekly: 1,
  monthly: 2,
  other: 3,
};

export function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function sortWindows(
  windows: Iterable<ServerProviderUsageWindow>,
): ReadonlyArray<ServerProviderUsageWindow> {
  return [...windows].toSorted(
    (left, right) =>
      WINDOW_KIND_ORDER[left.kind] - WINDOW_KIND_ORDER[right.kind] ||
      left.id.localeCompare(right.id),
  );
}

export function makeUsageLimits(input: {
  readonly checkedAt: string;
  readonly windows: Iterable<ServerProviderUsageWindow>;
}): ServerProviderUsageLimits {
  return { checkedAt: input.checkedAt, windows: sortWindows(input.windows) };
}

export function makeUnavailableUsageLimits(input: {
  readonly checkedAt: string;
  readonly reason: "unsupported" | "probeFailed";
  readonly message?: string;
}): ServerProviderUsageLimits {
  return {
    checkedAt: input.checkedAt,
    windows: [],
    unavailable: {
      reason: input.reason,
      ...(input.message ? { message: input.message } : {}),
    },
  };
}

export function applyUsageLimitsUpdate(input: {
  readonly previous: ServerProviderUsageLimits | undefined;
  readonly update: ProviderUsageLimitsUpdate;
  readonly checkedAt: string;
}): ServerProviderUsageLimits | undefined {
  const { previous, update } = input;
  if (update.windows.length === 0 || previous?.unavailable?.reason === "unsupported") {
    return previous;
  }
  const merged = new Map(previous?.windows.map((window) => [window.id, window] as const));
  // Codex repeats unchanged limits on token ticks; avoid allocating snapshots for no-ops.
  let changed = false;
  for (const window of update.windows) {
    const existing = merged.get(window.id);
    const next: ServerProviderUsageWindow = {
      ...window,
      usedPercent: clampPercent(window.usedPercent),
      ...(window.resetsAt === undefined && existing?.resetsAt !== undefined
        ? { resetsAt: existing.resetsAt }
        : {}),
      ...(window.windowDurationMins === undefined && existing?.windowDurationMins !== undefined
        ? { windowDurationMins: existing.windowDurationMins }
        : {}),
    };
    if (existing === undefined || !usageWindowEquals(existing, next)) {
      merged.set(window.id, next);
      changed = true;
    }
  }
  if (!changed && previous !== undefined) {
    return previous;
  }
  const unavailable =
    previous === undefined ? { reason: "probeFailed" as const } : previous.unavailable;
  return {
    ...makeUsageLimits({ checkedAt: input.checkedAt, windows: merged.values() }),
    ...(previous?.resetCredits !== undefined ? { resetCredits: previous.resetCredits } : {}),
    ...(unavailable !== undefined ? { unavailable } : {}),
  };
}

function usageWindowEquals(a: ServerProviderUsageWindow, b: ServerProviderUsageWindow): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.label === b.label &&
    a.usedPercent === b.usedPercent &&
    a.resetsAt === b.resetsAt &&
    a.windowDurationMins === b.windowDurationMins
  );
}

export function resolveUsageLimitsAfterProbe(input: {
  readonly published: ServerProviderUsageLimits | undefined;
  readonly probed: ServerProviderUsageLimits | undefined;
}): ServerProviderUsageLimits | undefined {
  const { published, probed } = input;
  if (probed?.unavailable?.reason === "probeFailed" && published && !published.unavailable) {
    return applyUsageReadFailure({
      previous: published,
      at: probed.checkedAt,
      reason: "requestFailed",
    });
  }
  if (
    published &&
    probed &&
    !published.unavailable &&
    !probed.unavailable &&
    Date.parse(published.checkedAt) > Date.parse(probed.checkedAt)
  ) {
    return { ...probed, checkedAt: published.checkedAt, windows: published.windows };
  }
  return probed;
}

/**
 * Keeps the windows and `checkedAt` of the last good reading. A repeated reason publishes
 * nothing until its retry time passes, so a backoff does not republish on every poll.
 */
export function applyUsageReadFailure(input: {
  readonly previous: ServerProviderUsageLimits | undefined;
  readonly at: string;
  readonly reason: NonNullable<ServerProviderUsageLimits["lastError"]>["reason"];
  readonly retryAt?: string | undefined;
}): ServerProviderUsageLimits | undefined {
  const { previous, at, reason, retryAt } = input;
  if (previous === undefined || previous.unavailable !== undefined) return previous;
  const last = previous.lastError;
  const sameFailure = last?.reason === reason;
  if (
    sameFailure &&
    (retryAt === undefined ||
      (last.retryAt !== undefined && Date.parse(at) < Date.parse(last.retryAt)))
  ) {
    return previous;
  }
  return {
    ...previous,
    lastError: { at: sameFailure ? last.at : at, reason, ...(retryAt ? { retryAt } : {}) },
  };
}

// Below the 3 minutes after which clients mark a reading stale, so an unchanged reading never reads as old.
const UNCHANGED_READING_REPUBLISH_MS = 120_000;

/**
 * A good reading replaces the windows wholesale, clears `lastError`, and keeps reset credits read elsewhere.
 * An unchanged reading returns `previous` so nothing is published until it is due to refresh `checkedAt`.
 */
export function applyUsageReading(input: {
  readonly previous: ServerProviderUsageLimits | undefined;
  readonly reading: ServerProviderUsageLimits;
}): ServerProviderUsageLimits {
  const { previous, reading } = input;
  if (previous?.unavailable?.reason === "unsupported") {
    return previous;
  }
  const checkedAtMs = Date.parse(reading.checkedAt);
  if (previous && Date.parse(previous.checkedAt) > checkedAtMs) {
    return previous;
  }
  const next: ServerProviderUsageLimits = {
    ...reading,
    ...(reading.resetCredits === undefined && previous?.resetCredits !== undefined
      ? { resetCredits: previous.resetCredits }
      : {}),
  };
  if (
    previous &&
    !previous.unavailable &&
    !previous.lastError &&
    !next.unavailable &&
    checkedAtMs - Date.parse(previous.checkedAt) < UNCHANGED_READING_REPUBLISH_MS &&
    previous.windows.length === next.windows.length &&
    previous.windows.every((window, index) => usageWindowEquals(window, next.windows[index]!)) &&
    resetCreditsEqual(previous.resetCredits, next.resetCredits)
  ) {
    return previous;
  }
  return next;
}

function resetCreditsEqual(
  a: ServerProviderUsageLimits["resetCredits"],
  b: ServerProviderUsageLimits["resetCredits"],
): boolean {
  return (
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      a.availableCount === b.availableCount &&
      a.nextExpiresAt === b.nextExpiresAt &&
      a.nextCreditId === b.nextCreditId)
  );
}
