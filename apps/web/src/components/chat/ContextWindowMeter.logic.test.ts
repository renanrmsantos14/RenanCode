import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  coldCacheWarning,
  resolveContextWindowModelDisplayName,
  shouldReserveContextWindowMeter,
} from "./ContextWindowMeter.logic";

describe("resolveContextWindowModelDisplayName", () => {
  it("uses the selected model from the exact provider instance", () => {
    const primaryInstanceId = ProviderInstanceId.make("codex");
    const selectedInstanceId = ProviderInstanceId.make("codex-work");
    const modelOptionsByInstance = new Map([
      [
        primaryInstanceId,
        [{ slug: "gpt-5.6-sol", name: "Primary profile model", shortName: "Primary" }],
      ],
      [selectedInstanceId, [{ slug: "gpt-5.6-sol", name: "GPT-5.6 Sol", shortName: "5.6 Sol" }]],
    ]);

    expect(
      resolveContextWindowModelDisplayName(
        {
          instanceId: selectedInstanceId,
          model: "gpt-5.6-sol",
        },
        modelOptionsByInstance,
      ),
    ).toBe("GPT-5.6 Sol");
  });
});

describe("shouldReserveContextWindowMeter", () => {
  const loadingStartedThread = {
    meterEnabled: true,
    detailLoading: true,
    threadStarted: true,
    providerReportsContextWindow: true,
  };

  it("holds the meter's slot while a started thread's detail loads", () => {
    expect(shouldReserveContextWindowMeter(loadingStartedThread)).toBe(true);
  });

  it("reserves while the thread's provider is not in the catalog yet", () => {
    expect(
      shouldReserveContextWindowMeter({
        ...loadingStartedThread,
        providerReportsContextWindow: null,
      }),
    ).toBe(true);
  });
});

describe("coldCacheWarning", () => {
  const usage = {
    usedTokens: 150_000,
    cachedInputTokens: 140_000,
    updatedAt: "2026-08-24T12:00:00.000Z",
  };
  const minutesLater = (minutes: number) =>
    new Date(Date.parse(usage.updatedAt) + minutes * 60_000).toISOString();

  it.each([
    { name: "expired, unreported TTL falls back per provider", driver: "codex", usage, at: 6 },
    { name: "still warm", driver: "codex", usage, at: 4, expected: null },
    {
      name: "reported TTL outlasts the fallback",
      driver: "claudeAgent",
      usage: { ...usage, promptCacheTtlMs: 3_600_000 },
      at: 30,
      expected: null,
    },
    {
      name: "reported expiry has passed",
      driver: "claudeAgent",
      usage: { ...usage, promptCacheExpiresAt: minutesLater(10) },
      at: 11,
    },
    {
      name: "small thread",
      driver: "codex",
      usage: { ...usage, usedTokens: 99_999 },
      at: 60,
      expected: null,
    },
    {
      name: "no cache data reported",
      driver: "codex",
      usage: { usedTokens: 150_000, updatedAt: usage.updatedAt },
      at: 60,
      expected: null,
    },
    { name: "cursor is account-level only", driver: "cursor", usage, at: 60, expected: null },
    { name: "kiro reports nothing", driver: "kiro", usage, at: 60, expected: null },
  ])("$name", ({ driver, usage: input, at, expected }) => {
    expect(coldCacheWarning({ driver, usage: input, now: minutesLater(at) })).toEqual(
      expected === null ? null : { usedTokens: input.usedTokens },
    );
  });
});
