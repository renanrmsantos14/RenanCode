import { describe, expect, it } from "vite-plus/test";

import {
  applyUsageLimitsUpdate,
  applyUsageReadFailure,
  applyUsageReading,
  resolveUsageLimitsAfterProbe,
} from "./usageLimits.ts";

const checkedAt = "2026-09-03T12:00:00.000Z";
const session = {
  id: "five_hour",
  kind: "session",
  label: "Session",
  usedPercent: 40,
  windowDurationMins: 300,
  resetsAt: "2026-09-03T14:00:00.000Z",
} as const;
const weekly = {
  id: "seven_day",
  kind: "weekly",
  label: "Weekly",
  usedPercent: 20,
  windowDurationMins: 10_080,
} as const;
const published = { checkedAt, windows: [session, weekly] };

describe("applyUsageLimitsUpdate", () => {
  it("returns the published object itself when no window moved", () => {
    const next = applyUsageLimitsUpdate({
      previous: published,
      checkedAt: "2026-09-03T12:00:05.000Z",
      update: {
        windows: [
          { ...weekly },
          { id: "five_hour", kind: "session", label: "Session", usedPercent: 40 },
        ],
      },
    });
    expect(next).toBe(published);
  });

  it("upserts by id and keeps the reset a percent-only update omits", () => {
    const next = applyUsageLimitsUpdate({
      previous: published,
      checkedAt: "2026-09-03T12:00:05.000Z",
      update: {
        windows: [{ id: "five_hour", kind: "session", label: "Session", usedPercent: 55 }],
      },
    });
    expect(next).not.toBe(published);
    expect(next).toEqual({
      checkedAt: "2026-09-03T12:00:05.000Z",
      windows: [{ ...session, usedPercent: 55 }, weekly],
    });
  });

  it("leaves an unsupported account and an empty update alone", () => {
    const unsupported = { checkedAt, windows: [], unavailable: { reason: "unsupported" as const } };
    expect(
      applyUsageLimitsUpdate({ previous: unsupported, checkedAt, update: { windows: [session] } }),
    ).toBe(unsupported);
    expect(
      applyUsageLimitsUpdate({ previous: published, checkedAt, update: { windows: [] } }),
    ).toBe(published);
  });

  it("marks a first sparse update as unavailable", () => {
    expect(
      applyUsageLimitsUpdate({ previous: undefined, checkedAt, update: { windows: [weekly] } }),
    ).toEqual({ checkedAt, windows: [weekly], unavailable: { reason: "probeFailed" } });
  });

  it("preserves reset credits when a streamed window update changes usage", () => {
    const resetCredits = { availableCount: 2, nextExpiresAt: "2026-10-01T00:00:00.000Z" };
    const next = applyUsageLimitsUpdate({
      previous: { ...published, resetCredits },
      checkedAt: "2026-09-03T12:00:05.000Z",
      update: { windows: [{ ...session, usedPercent: 55 }] },
    });

    expect(next).toEqual({
      checkedAt: "2026-09-03T12:00:05.000Z",
      windows: [{ ...session, usedPercent: 55 }, weekly],
      resetCredits,
    });
  });
});

describe("resolveUsageLimitsAfterProbe", () => {
  it("uses read order for windows while taking metadata from the successful probe", () => {
    const live = {
      checkedAt: "2026-09-03T12:00:05.000Z",
      windows: [
        { ...session, usedPercent: 95 },
        { ...weekly, usedPercent: 70 },
      ],
      resetCredits: { availableCount: 2 },
      externalUsage: { label: "Old dashboard", url: "https://example.com/old" },
    };
    const probed = {
      ...published,
      windows: [{ ...session, usedPercent: 0 }],
      resetCredits: { availableCount: 1 },
      externalUsage: { label: "Usage dashboard", url: "https://example.com/usage" },
    };

    expect(resolveUsageLimitsAfterProbe({ published: live, probed })).toEqual({
      ...probed,
      checkedAt: live.checkedAt,
      windows: live.windows,
    });

    const sameTime = { ...probed, checkedAt: live.checkedAt };
    const newer = { ...probed, checkedAt: "2026-09-03T12:00:06.000Z" };
    expect(resolveUsageLimitsAfterProbe({ published: live, probed: sameTime })).toEqual(sameTime);
    expect(resolveUsageLimitsAfterProbe({ published: live, probed: newer })).toEqual(newer);
  });

  it("keeps the last good windows through a failed probe but not an unsupported one", () => {
    const failed = { checkedAt, windows: [], unavailable: { reason: "probeFailed" as const } };
    const unsupported = { checkedAt, windows: [], unavailable: { reason: "unsupported" as const } };
    expect(resolveUsageLimitsAfterProbe({ published, probed: failed })).toEqual({
      ...published,
      lastError: { at: checkedAt, reason: "requestFailed" },
    });
    const stillFailing = {
      ...published,
      lastError: { at: checkedAt, reason: "requestFailed" as const },
    };
    expect(resolveUsageLimitsAfterProbe({ published: stillFailing, probed: failed })).toBe(
      stillFailing,
    );
    expect(resolveUsageLimitsAfterProbe({ published, probed: unsupported })).toBe(unsupported);
    expect(resolveUsageLimitsAfterProbe({ published: undefined, probed: failed })).toBe(failed);
  });
});

describe("usage readings", () => {
  const later = "2026-09-03T12:01:00.000Z";
  const reading = { checkedAt: later, windows: [{ ...session, usedPercent: 41 }, weekly] };

  it("replaces windows, advances checkedAt, and clears a recorded failure", () => {
    const failed = applyUsageReadFailure({
      previous: published,
      at: later,
      reason: "rateLimited",
    });
    expect(failed?.lastError).toEqual({ at: later, reason: "rateLimited" });
    expect(applyUsageReading({ previous: failed, reading })).toEqual(reading);
  });

  it("keeps windows and checkedAt through a failure and records the first failure of a reason only", () => {
    const failed = applyUsageReadFailure({ previous: published, at: later, reason: "signedOut" });
    expect(failed).toEqual({ ...published, lastError: { at: later, reason: "signedOut" } });
    expect(
      applyUsageReadFailure({
        previous: failed,
        at: "2026-09-03T12:02:00.000Z",
        reason: "signedOut",
      }),
    ).toBe(failed);
    expect(
      applyUsageReadFailure({ previous: failed, at: later, reason: "requestFailed" })?.lastError
        ?.reason,
    ).toBe("requestFailed");
  });

  it("refreshes the retry time of a repeated failure only after it passes", () => {
    const retryAt = "2026-09-03T12:03:00.000Z";
    const failed = applyUsageReadFailure({
      previous: published,
      at: later,
      reason: "rateLimited",
      retryAt,
    });
    expect(failed?.lastError).toEqual({ at: later, reason: "rateLimited", retryAt });
    expect(
      applyUsageReadFailure({
        previous: failed,
        at: "2026-09-03T12:02:00.000Z",
        reason: "rateLimited",
        retryAt: "2026-09-03T12:04:00.000Z",
      }),
    ).toBe(failed);
    expect(
      applyUsageReadFailure({
        previous: failed,
        at: retryAt,
        reason: "rateLimited",
        retryAt: "2026-09-03T12:07:00.000Z",
      })?.lastError,
    ).toEqual({ at: later, reason: "rateLimited", retryAt: "2026-09-03T12:07:00.000Z" });
  });

  it("ignores failures without a good reading to attach to and readings older than the published one", () => {
    expect(applyUsageReadFailure({ previous: undefined, at: later, reason: "signedOut" })).toBe(
      undefined,
    );
    const unavailable = { checkedAt, windows: [], unavailable: { reason: "probeFailed" as const } };
    expect(applyUsageReadFailure({ previous: unavailable, at: later, reason: "signedOut" })).toBe(
      unavailable,
    );
    expect(
      applyUsageReading({
        previous: { ...published, checkedAt: later },
        reading: { checkedAt, windows: [] },
      }).checkedAt,
    ).toBe(later);
  });

  it("keeps reset credits that the reading does not carry", () => {
    const resetCredits = { availableCount: 1 };
    expect(
      applyUsageReading({ previous: { ...published, resetCredits }, reading }).resetCredits,
    ).toEqual(resetCredits);
  });

  it("publishes an identical reading only once the last one is 120 s old, and a changed one at once", () => {
    const first = applyUsageReading({
      previous: published,
      reading: { ...published, checkedAt: later },
    });
    expect(first).toBe(published);
    const due = { ...published, checkedAt: "2026-09-03T12:02:00.000Z" };
    expect(applyUsageReading({ previous: published, reading: due })).toEqual(due);
    const changed = { checkedAt: later, windows: [{ ...session, usedPercent: 41 }, weekly] };
    expect(applyUsageReading({ previous: published, reading: changed })).toEqual(changed);
  });
});
