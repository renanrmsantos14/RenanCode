import {
  groupSubsessionsByParent,
  subsessionParentRef,
} from "@t3tools/client-runtime/state/subsessions";
import { isListedThreadLineage } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";

/** Deeper subsessions keep nesting but stop indenting. */
export const THREAD_LIST_SUBSESSION_MAX_INDENT = 3;

type NestableThread = Pick<
  EnvironmentThreadShell,
  | "archivedAt"
  | "createdAt"
  | "creationSource"
  | "delegatedFrom"
  | "environmentId"
  | "id"
  | "launchedFrom"
  | "lineage"
  | "projectId"
>;

export interface ThreadListSubsessions<T> {
  /** Children by parent key (`environmentId:threadId`), oldest first. */
  readonly childrenByParent: ReadonlyMap<string, readonly T[]>;
  /** Threads listed under a parent instead of on their own. */
  readonly nestedKeys: ReadonlySet<string>;
}

const keyOf = (thread: Pick<EnvironmentThreadShell, "environmentId" | "id">) =>
  `${thread.environmentId}:${thread.id}`;

/**
 * A thread nests when its subsession parent is in the same environment and project and the
 * parent chain ends at a listed thread. Nesting needs no list scope: a parent shares the
 * child's project. Chains that loop back on themselves stay flat.
 */
export function nestThreadListSubsessions<T extends NestableThread>(
  threads: readonly T[],
): ThreadListSubsessions<T> {
  const live = new Map<string, T>();
  for (const thread of threads) {
    if (thread.archivedAt === null) live.set(keyOf(thread), thread);
  }
  const parentKeyByChild = new Map<string, string>();
  for (const [key, thread] of live) {
    const ref = subsessionParentRef(thread);
    if (ref === null || ref.environmentId !== thread.environmentId) continue;
    const parentKey = `${ref.environmentId}:${ref.threadId}`;
    const parent = live.get(parentKey);
    if (parent !== undefined && parent.projectId === thread.projectId) {
      parentKeyByChild.set(key, parentKey);
    }
  }
  const reachesListedRoot = (start: string): boolean => {
    const path = new Set<string>();
    let at = start;
    for (;;) {
      if (path.has(at)) return false;
      path.add(at);
      const next = parentKeyByChild.get(at);
      if (next === undefined) return isListedThreadLineage(live.get(at)!.lineage);
      at = next;
    }
  };
  const nested: T[] = [];
  const nestedKeys = new Set<string>();
  for (const key of parentKeyByChild.keys()) {
    if (!reachesListedRoot(key)) continue;
    nested.push(live.get(key)!);
    nestedKeys.add(key);
  }
  const childrenByParent = new Map<string, readonly T[]>();
  // groupSubsessionsByParent sorts siblings and keys them its own way; re-key like the list.
  for (const siblings of groupSubsessionsByParent(nested).values()) {
    childrenByParent.set(parentKeyByChild.get(keyOf(siblings[0]!))!, siblings);
  }
  return { childrenByParent, nestedKeys };
}
