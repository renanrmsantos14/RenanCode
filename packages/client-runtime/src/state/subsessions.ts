import {
  type EnvironmentId,
  type OrchestrationV2ThreadShell,
  type ScopedThreadRef,
} from "@t3tools/contracts";

import { threadKey } from "./entities.ts";

type SubsessionThread = Pick<OrchestrationV2ThreadShell, "id" | "lineage" | "creationSource"> & {
  readonly environmentId: EnvironmentId;
  readonly createdAt: string;
  readonly archivedAt: string | null;
  readonly delegatedFrom?: OrchestrationV2ThreadShell["delegatedFrom"] | null;
  readonly launchedFrom?: OrchestrationV2ThreadShell["launchedFrom"] | null;
};

/**
 * The thread whose agent opened this one, for nesting it as a subsession, or null.
 * Native provider subagents and side chats have their own nesting and return null.
 */
export function subsessionParentRef(thread: SubsessionThread): ScopedThreadRef | null {
  if (thread.lineage.sideChat === true) return null;
  if (thread.launchedFrom != null) {
    return { environmentId: thread.environmentId, threadId: thread.launchedFrom };
  }
  const { parentThreadId, relationshipToParent } = thread.lineage;
  if (
    parentThreadId !== null &&
    relationshipToParent === "subagent" &&
    thread.creationSource === "mcp"
  ) {
    return { environmentId: thread.environmentId, threadId: parentThreadId };
  }
  if (thread.delegatedFrom != null) {
    return {
      environmentId: thread.delegatedFrom.environmentId,
      threadId: thread.delegatedFrom.threadId,
    };
  }
  return null;
}

/**
 * Subsessions by parent thread key, oldest first. A parent the caller cannot list
 * (`isParentVisible` false) leaves its children out, so they stay top-level.
 */
export function groupSubsessionsByParent<T extends SubsessionThread>(
  threads: readonly T[],
  isParentVisible: (parent: ScopedThreadRef) => boolean = () => true,
): ReadonlyMap<string, readonly T[]> {
  const byParent = new Map<string, T[]>();
  for (const thread of threads) {
    if (thread.archivedAt !== null) continue;
    const parent = subsessionParentRef(thread);
    if (parent === null || !isParentVisible(parent)) continue;
    const key = threadKey(parent);
    const siblings = byParent.get(key);
    if (siblings) siblings.push(thread);
    else byParent.set(key, [thread]);
  }
  for (const siblings of byParent.values()) {
    siblings.sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id),
    );
  }
  return byParent;
}
