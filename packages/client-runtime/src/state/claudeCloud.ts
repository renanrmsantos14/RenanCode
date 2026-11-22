import { isClaudeCloudThreadId, WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as Persistence from "../platform/persistence.ts";
import { createEnvironmentRpcCommand } from "./runtime.ts";

export function createClaudeCloudEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Persistence.EnvironmentCacheStore | R, E>,
) {
  return {
    startSession: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:claude-cloud:start-session",
      tag: WS_METHODS.claudeCloudStartSession,
    }),
    suggestPlacement: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:claude-cloud:suggest-placement",
      tag: WS_METHODS.claudeCloudSuggestPlacement,
    }),
  };
}

/** Every environment logged into the same Claude account mirrors the same cloud session; show it once, preferring the copy that owns the run, then a preferred environment. */
export function dedupeClaudeCloudThreads<
  T extends {
    readonly id: string;
    readonly environmentId: EnvironmentId;
    readonly activeRunId?: unknown;
    readonly latestRunId?: unknown;
  },
>(
  threads: readonly T[],
  preferred: EnvironmentId | ReadonlySet<EnvironmentId> | null,
  // Set where only a preferred copy can be used at all, so it wins over the copy that owns the run.
  options?: { readonly preferredFirst?: boolean },
): readonly T[] {
  const isPreferred = (environmentId: EnvironmentId) =>
    typeof preferred === "string"
      ? environmentId === preferred
      : preferred?.has(environmentId) === true;
  const rank = (thread: T) =>
    (thread.activeRunId != null ? 4 : 0) +
    (thread.latestRunId != null ? 2 : 0) +
    (isPreferred(thread.environmentId) ? (options?.preferredFirst ? 8 : 1) : 0);
  const chosen = new Map<string, T>();
  let hasDuplicate = false;
  for (const thread of threads) {
    if (!isClaudeCloudThreadId(thread.id)) continue;
    const current = chosen.get(thread.id);
    if (current === undefined) {
      chosen.set(thread.id, thread);
      continue;
    }
    hasDuplicate = true;
    if (rank(thread) > rank(current)) chosen.set(thread.id, thread);
  }
  if (!hasDuplicate) return threads;
  return threads.filter(
    (thread) => !isClaudeCloudThreadId(thread.id) || chosen.get(thread.id) === thread,
  );
}
