import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  nativeSubagentRows,
  type NativeSubagentRow,
} from "@t3tools/client-runtime/state/nativeSubagents";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isProviderNativeSubagentThread,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEffect } from "react";

import { appAtomRegistry } from "~/rpc/atomRegistry";
import { threadFamilies, useEnvironmentThread } from "~/state/threads";
import { resolveSidebarRowThreadId } from "../Sidebar.logic";

const NO_NATIVE_PARENTS: ReadonlyMap<string, string> = new Map();

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
 * Provider-native subagents of the open thread, or of the parent of an open subagent: their
 * child-thread shells take the status their parent's subagent records give, and nest under the
 * subagent or thread that launched them. Other threads' subagents stay out of the sidebar.
 */
export function useSidebarNativeSubagents(
  routeThreadRef: ScopedThreadRef | null,
  threads: readonly EnvironmentThreadShell[],
): {
  readonly threads: readonly EnvironmentThreadShell[];
  readonly nativeParentKeyByChild: ReadonlyMap<string, string>;
} {
  const environmentId = routeThreadRef?.environmentId ?? null;
  const routeThreadId = routeThreadRef?.threadId ?? null;
  const routeThread = Option.getOrNull(
    useEnvironmentThread(environmentId, routeThreadId).data,
  )?.thread;
  // An idle child can be missing from the shell; then its own detail names its parent.
  const rowThreadId =
    environmentId === null || routeThreadId === null
      ? null
      : resolveSidebarRowThreadId(routeThreadId, environmentId, threads);
  const ownerThreadId: ThreadId | null =
    rowThreadId !== routeThreadId
      ? rowThreadId
      : routeThread !== undefined && isProviderNativeSubagentThread(routeThread)
        ? routeThread.lineage.parentThreadId
        : routeThreadId;
  const ownerSubagents = Option.getOrNull(
    useEnvironmentThread(environmentId, ownerThreadId).data,
  )?.subagents;
  const rows = ownerSubagents === undefined ? null : nativeSubagentRows(ownerSubagents);
  const mountsFamily = environmentId !== null && ownerThreadId !== null && (rows?.size ?? 0) > 0;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the owner's family (idle subagent shells the server leaves out) merged into the shell while its subagents are listed
  useEffect(() => {
    if (!mountsFamily || environmentId === null || ownerThreadId === null) return;
    return threadFamilies.mount(appAtomRegistry, environmentId, ownerThreadId);
  }, [mountsFamily, environmentId, ownerThreadId]);

  if (rows === null || rows.size === 0 || environmentId === null) {
    return { threads, nativeParentKeyByChild: NO_NATIVE_PARENTS };
  }
  const keyOf = (threadId: ThreadId) => scopedThreadKey(scopeThreadRef(environmentId, threadId));
  const nativeParentKeyByChild = new Map<string, string>();
  const overlaid = threads.map((thread) => {
    const row =
      thread.environmentId === environmentId && isProviderNativeSubagentThread(thread)
        ? rows.get(thread.id)
        : undefined;
    if (row === undefined) return thread;
    nativeParentKeyByChild.set(keyOf(thread.id), keyOf(row.parentThreadId));
    return { ...thread, runtime: nativeSubagentRuntime(thread, row) };
  });
  return { threads: overlaid, nativeParentKeyByChild };
}
