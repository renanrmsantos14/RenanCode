import { NodeId, ThreadId, type OrchestrationV2Subagent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { nativeSubagentRows } from "./nativeSubagents.ts";

const tid = ThreadId.make;
const record = (
  id: string,
  extra: Partial<Parameters<typeof nativeSubagentRows>[0][number]> = {},
): Parameters<typeof nativeSubagentRows>[0][number] => ({
  id: NodeId.make(id),
  threadId: tid("root"),
  parentNodeId: NodeId.make("root-turn"),
  origin: "provider_native",
  childThreadId: tid(`child-${id}`),
  status: "running",
  ...extra,
});

describe("nativeSubagentRows", () => {
  it.each<[OrchestrationV2Subagent["status"], string]>([
    ["pending", "running"],
    ["running", "running"],
    ["waiting", "running"],
    ["idle", "running"],
    ["completed", "completed"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["interrupted", "cancelled"],
  ])("shows %s as %s", (status, shown) => {
    expect(nativeSubagentRows([record("a", { status })]).get(tid("child-a"))?.status).toBe(shown);
  });

  it("nests a subagent under the subagent that launched it, else under the thread", () => {
    const rows = nativeSubagentRows([
      record("outer"),
      record("inner", { parentNodeId: NodeId.make("outer") }),
      record("sibling"),
    ]);
    expect(rows.get(tid("child-outer"))?.parentThreadId).toBe(tid("root"));
    expect(rows.get(tid("child-inner"))?.parentThreadId).toBe(tid("child-outer"));
    expect(rows.get(tid("child-sibling"))?.parentThreadId).toBe(tid("root"));
  });

  it("leaves out app-owned tasks and records without a child thread", () => {
    const rows = nativeSubagentRows([
      record("delegated", { origin: "app_owned" }),
      record("pending", { childThreadId: null }),
    ]);
    expect(rows.size).toBe(0);
  });
});
