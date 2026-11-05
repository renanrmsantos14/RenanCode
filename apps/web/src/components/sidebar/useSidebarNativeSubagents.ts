import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  nativeSubagentRows,
  remoteTaskRows,
  type NativeSubagentRow,
  type RemoteTaskRow,
} from "@t3tools/client-runtime/state/nativeSubagents";
import {
  isProviderNativeSubagentThread,
  type EnvironmentId,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { useEffect } from "react";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { useDelegatedUnderParent } from "~/state/entities";
import {
  nativeSubagentParentAtom,
  subagentRecordsOfThreadsAtom,
  threadFamilies,
} from "~/state/threads";
import { sidebarSubagentOwners } from "../Sidebar.logic";

const NO_NATIVE_PARENTS: ReadonlyMap<string, string> = new Map();
const NO_REMOTE_TASKS: ReadonlyMap<string, readonly RemoteTaskRow[]> = new Map();
const NO_ROUTE_PARENT = Atom.make<ThreadId | null>(null).pipe(
  Atom.withLabel("web-native-subagent-parent:none"),
);

function nativeSubagentRuntime(
  thread: EnvironmentThreadShell,
  row: NativeSubagentRow,
): EnvironmentThreadShell["runtime"] {
  return {
    status: row.status,
    activeRunId: null,
    providerInstanceId: thread.providerInstanceId,
    providerName: thread.runtime?.providerName ?? null,
    lastError: null,
    updatedAt: thread.updatedAt,
  };
}

/**
 * Provider-native subagents around the open thread: those of the open thread and the threads
 * above it, and of the running subsessions under its row, in any environment. Their child-thread
 * shells take the status their owner's subagent records give and nest under whoever launched them.
 */
export function useSidebarNativeSubagents(
  routeThreadRef: ScopedThreadRef | null,
  threads: readonly EnvironmentThreadShell[],
): {
  readonly threads: readonly EnvironmentThreadShell[];
  readonly nativeParentKeyByChild: ReadonlyMap<string, string>;
  /** Tasks an owner delegated to linked environments, by the owner's thread key. */
  readonly remoteTasksByParent: ReadonlyMap<string, readonly RemoteTaskRow[]>;
} {
  const routeNativeParent = useAtomValue(
    routeThreadRef === null
      ? NO_ROUTE_PARENT
      : nativeSubagentParentAtom(
          JSON.stringify([routeThreadRef.environmentId, routeThreadRef.threadId]),
        ),
  );
  const owners =
    routeThreadRef === null
      ? []
      : sidebarSubagentOwners({ route: routeThreadRef, routeNativeParent, threads });
  const records = useAtomValue(
    subagentRecordsOfThreadsAtom(
      JSON.stringify(owners.map((owner) => [owner.environmentId, owner.threadId])),
    ),
  );

  const delegatedUnderParent = useDelegatedUnderParent();

  const keyOf = (environmentId: EnvironmentId, threadId: ThreadId) =>
    scopedThreadKey(scopeThreadRef(environmentId, threadId));
  const remoteTasksByParent = new Map<string, readonly RemoteTaskRow[]>();
  owners.forEach((owner, index) => {
    const tasks = remoteTaskRows(records[index] ?? [], delegatedUnderParent);
    if (tasks.length > 0)
      remoteTasksByParent.set(keyOf(owner.environmentId, owner.threadId), tasks);
  });
  const remoteTasks = remoteTasksByParent.size === 0 ? NO_REMOTE_TASKS : remoteTasksByParent;
  const rowByChildKey = new Map<string, NativeSubagentRow>();
  const nativeParentKeyByChild = new Map<string, string>();
  const familyOwners: Array<[EnvironmentId, ThreadId]> = [];
  owners.forEach((owner, index) => {
    const rows = nativeSubagentRows(records[index] ?? []);
    if (rows.size === 0) return;
    familyOwners.push([owner.environmentId, owner.threadId]);
    for (const row of rows.values()) {
      const childKey = keyOf(owner.environmentId, row.childThreadId);
      rowByChildKey.set(childKey, row);
      nativeParentKeyByChild.set(childKey, keyOf(owner.environmentId, row.parentThreadId));
    }
  });
  const familyKey = JSON.stringify(familyOwners);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps each owner's family (idle subagent shells the server leaves out) merged into the shell while its subagents are listed
  useEffect(() => {
    const releases = (JSON.parse(familyKey) as Array<[EnvironmentId, ThreadId]>).map(
      ([environmentId, threadId]) => threadFamilies.mount(appAtomRegistry, environmentId, threadId),
    );
    return () => {
      for (const release of releases) release();
    };
  }, [familyKey]);

  if (rowByChildKey.size === 0) {
    return { threads, nativeParentKeyByChild: NO_NATIVE_PARENTS, remoteTasksByParent: remoteTasks };
  }
  const overlaid = threads.map((thread) => {
    const row = isProviderNativeSubagentThread(thread)
      ? rowByChildKey.get(keyOf(thread.environmentId, thread.id))
      : undefined;
    return row === undefined ? thread : { ...thread, runtime: nativeSubagentRuntime(thread, row) };
  });
  return { threads: overlaid, nativeParentKeyByChild, remoteTasksByParent: remoteTasks };
}
