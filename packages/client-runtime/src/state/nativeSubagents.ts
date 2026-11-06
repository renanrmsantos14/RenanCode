import type {
  OrchestrationV2RemoteTaskChild,
  OrchestrationV2Subagent,
  ThreadId,
} from "@t3tools/contracts";

import { threadKey } from "./entities.ts";

export type NativeSubagentRowStatus = "running" | "completed" | "failed" | "cancelled";

export interface NativeSubagentRow {
  readonly childThreadId: ThreadId;
  /** The subagent that launched this one, else the thread whose agent did. */
  readonly parentThreadId: ThreadId;
  readonly status: NativeSubagentRowStatus;
}

type NativeSubagentRecord = Pick<
  OrchestrationV2Subagent,
  "id" | "threadId" | "parentNodeId" | "origin" | "childThreadId" | "status"
>;

function nativeSubagentRowStatus(
  status: OrchestrationV2Subagent["status"],
): NativeSubagentRowStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
    case "interrupted":
      return "cancelled";
    default:
      return "running";
  }
}

/**
 * Provider-native subagents a thread's agent launched, by child thread, from that thread's
 * subagent records. Nested subagents are recorded on the same thread and hang off their
 * owner's record through `parentNodeId`.
 */
export function nativeSubagentRows(
  subagents: ReadonlyArray<NativeSubagentRecord>,
): ReadonlyMap<ThreadId, NativeSubagentRow> {
  const childThreadByRecord = new Map<string, ThreadId>();
  for (const subagent of subagents) {
    if (subagent.origin === "provider_native" && subagent.childThreadId !== null) {
      childThreadByRecord.set(subagent.id, subagent.childThreadId);
    }
  }
  const rows = new Map<ThreadId, NativeSubagentRow>();
  for (const subagent of subagents) {
    if (subagent.origin !== "provider_native" || subagent.childThreadId === null) continue;
    const owner = childThreadByRecord.get(subagent.parentNodeId);
    rows.set(subagent.childThreadId, {
      childThreadId: subagent.childThreadId,
      parentThreadId:
        owner === undefined || owner === subagent.childThreadId ? subagent.threadId : owner,
      status: nativeSubagentRowStatus(subagent.status),
    });
  }
  return rows;
}

type RemoteTaskRecord = Pick<OrchestrationV2Subagent, "id" | "title" | "status" | "remoteChild">;

export type RemoteTaskRow = RemoteTaskRecord & {
  readonly remoteChild: OrchestrationV2RemoteTaskChild;
};

/**
 * Tasks a thread's agent delegated to linked environments, from its subagent records. One whose
 * thread there this client already nests under the parent (`nestedKeys`) shows as that thread.
 */
export function remoteTaskRows(
  subagents: ReadonlyArray<RemoteTaskRecord>,
  nestedKeys: ReadonlySet<string>,
): RemoteTaskRow[] {
  return subagents.filter(
    (subagent): subagent is RemoteTaskRow =>
      subagent.remoteChild !== undefined && !nestedKeys.has(threadKey(subagent.remoteChild)),
  );
}
