import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { dedupeClaudeCloudThreads } from "./claudeCloud.ts";

describe("dedupeClaudeCloudThreads", () => {
  it("shows a cloud session once, from the preferred environment", () => {
    const local = EnvironmentId.make("local");
    const other = EnvironmentId.make("other");
    const threads = [
      { id: "claude-cloud:s1", environmentId: other },
      { id: "plain", environmentId: other },
      { id: "claude-cloud:s1", environmentId: local },
      { id: "plain", environmentId: local },
    ];
    expect(dedupeClaudeCloudThreads(threads, local)).toEqual([
      { id: "plain", environmentId: other },
      { id: "claude-cloud:s1", environmentId: local },
      { id: "plain", environmentId: local },
    ]);
    expect(dedupeClaudeCloudThreads(threads, null)[0]).toBe(threads[0]);
    expect(dedupeClaudeCloudThreads(threads, new Set([local]))[1]).toBe(threads[2]);
    const unique = threads.slice(0, 2);
    expect(dedupeClaudeCloudThreads(unique, local)).toBe(unique);

    const run = (id: string) => id as never;
    const mirror = {
      id: "claude-cloud:s2",
      environmentId: local,
      activeRunId: null,
      latestRunId: null,
    };
    const withLatest = { ...mirror, environmentId: other, latestRunId: run("r1") };
    const withActive = {
      ...mirror,
      environmentId: other,
      activeRunId: run("r2"),
      latestRunId: run("r2"),
    };
    expect(dedupeClaudeCloudThreads([mirror, withLatest], local)).toEqual([withLatest]);
    expect(dedupeClaudeCloudThreads([mirror, withLatest, withActive], local)).toEqual([withActive]);
    expect(dedupeClaudeCloudThreads([withActive, mirror], local)).toEqual([withActive]);
    expect(
      dedupeClaudeCloudThreads([withActive, mirror], new Set([local]), { preferredFirst: true }),
    ).toEqual([mirror]);
  });
});
