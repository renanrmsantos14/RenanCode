import { dedupeClaudeCloudThreads } from "@t3tools/client-runtime/state/claudeCloud";
import type { ArchivedSnapshotEntry } from "@t3tools/client-runtime/state/threads";
import {
  scopeProject,
  scopeThreadShell,
  type EnvironmentProject,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { threadSearchSubject } from "@t3tools/client-runtime/state/thread-search";
import { isClaudeCloudThreadId, type EnvironmentId } from "@t3tools/contracts";
import { foldSearchQuery, rankSearchItems, scoreThreadSearch } from "@t3tools/shared/paletteSearch";
import * as Arr from "effect/Array";
import * as Order from "effect/Order";

import { scopedProjectKey } from "../../lib/scopedEntities";

export type ArchivedThreadSortOrder = "newest" | "oldest";

export interface ArchivedThreadGroup {
  readonly key: string;
  readonly project: EnvironmentProject;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
}

/** A cloud session's archived copy on every environment; unarchiving or deleting one leaves the rest. */
export function archivedThreadCopies(
  snapshots: ReadonlyArray<ArchivedSnapshotEntry>,
  thread: EnvironmentThreadShell,
): ReadonlyArray<EnvironmentThreadShell> {
  if (!isClaudeCloudThreadId(thread.id)) return [thread];
  return snapshots.flatMap((entry) =>
    entry.snapshot.threads
      .filter((copy) => copy.id === thread.id && copy.archivedAt !== null)
      .map((copy) => scopeThreadShell(entry.environmentId, copy)),
  );
}

function archiveTimestamp(thread: EnvironmentThreadShell): number {
  const timestamp = Date.parse(thread.archivedAt ?? thread.updatedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function matchesQuery(value: string | null, query: string): boolean {
  return value?.toLocaleLowerCase().includes(query) ?? false;
}

export function buildArchivedThreadGroups(input: {
  readonly snapshots: ReadonlyArray<ArchivedSnapshotEntry>;
  readonly environmentLabels: Readonly<Record<string, string>>;
  readonly environmentId: EnvironmentId | null;
  readonly searchQuery: string;
  readonly sortOrder: ArchivedThreadSortOrder;
}): ReadonlyArray<ArchivedThreadGroup> {
  const query = input.searchQuery.trim().toLocaleLowerCase();
  const foldedQuery = foldSearchQuery(input.searchQuery);
  const groups: ArchivedThreadGroup[] = [];
  const snapshots = input.snapshots.filter(
    (entry) => input.environmentId === null || input.environmentId === entry.environmentId,
  );
  // Archiving a cloud session archives every environment's copy of it; one is listed.
  const threadsByProjectKey = Arr.groupBy(
    dedupeClaudeCloudThreads(
      snapshots.flatMap((entry) =>
        entry.snapshot.threads
          .filter((thread) => thread.archivedAt !== null)
          .map((thread) => scopeThreadShell(entry.environmentId, thread)),
      ),
      null,
    ),
    (thread) => scopedProjectKey(thread.environmentId, thread.projectId),
  );

  for (const entry of snapshots) {
    const environmentLabel = input.environmentLabels[entry.environmentId] ?? null;

    for (const rawProject of entry.snapshot.projects) {
      const project = scopeProject(entry.environmentId, rawProject);
      const projectThreads =
        threadsByProjectKey[scopedProjectKey(project.environmentId, project.id)] ?? [];
      const groupMatches =
        query.length === 0 ||
        matchesQuery(project.title, query) ||
        matchesQuery(project.workspaceRoot, query) ||
        matchesQuery(environmentLabel, query);
      // Threads match as in every other thread search; the list keeps its own order.
      const matchingThreads = groupMatches
        ? projectThreads
        : rankSearchItems(projectThreads, (thread, options) =>
            scoreThreadSearch(foldedQuery, threadSearchSubject(thread, null), 0, {
              ...options,
              picks: false,
            }),
          ).map(({ item }) => item);

      if (matchingThreads.length === 0) {
        continue;
      }

      const timestampOrder = input.sortOrder === "newest" ? Order.flip(Order.Number) : Order.Number;
      groups.push({
        key: scopedProjectKey(project.environmentId, project.id),
        project,
        threads: Arr.sort(
          matchingThreads,
          Order.mapInput(
            Order.Struct({ timestamp: timestampOrder, title: Order.String, id: Order.String }),
            (thread: EnvironmentThreadShell) => ({
              timestamp: archiveTimestamp(thread),
              title: thread.title,
              id: thread.id,
            }),
          ),
        ),
      });
    }
  }

  const timestampOrder = input.sortOrder === "newest" ? Order.flip(Order.Number) : Order.Number;
  return Arr.sort(
    groups,
    Order.mapInput(
      Order.Struct({ timestamp: timestampOrder, title: Order.String, key: Order.String }),
      (group: ArchivedThreadGroup) => ({
        timestamp: group.threads[0] ? archiveTimestamp(group.threads[0]) : 0,
        title: group.project.title,
        key: group.key,
      }),
    ),
  );
}
