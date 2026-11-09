import { ProjectId, ThreadId, type WorkModule, WorkModuleId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatWorkModule, formatWorkModuleTree } from "./format.ts";

const base = {
  projectId: ProjectId.make("project:app"),
  note: "",
  waitingReason: null,
  dueDate: null,
  statusChangedAt: "2026-11-01T00:00:00.000Z",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
} as const;
const board: WorkModule = {
  ...base,
  id: WorkModuleId.make("m:board"),
  parentId: null,
  title: "Board",
  status: "active",
  position: 0,
};
const web: WorkModule = {
  ...base,
  id: WorkModuleId.make("m:web"),
  parentId: board.id,
  title: "Web tab",
  status: "waiting",
  waitingReason: "review",
  dueDate: "2026-11-20",
  position: 0,
};
const links = [
  { threadId: ThreadId.make("t:1"), moduleId: web.id, suggested: false, linkedAt: base.createdAt },
];

describe("work module text", () => {
  it("renders the tree with ids, status, due date and thread counts", () => {
    expect(formatWorkModuleTree([web, board], links)).toBe(
      [
        "- Board [active] (id m:board)",
        "  - Web tab [waiting: review, due 2026-11-20, 1 thread] (id m:web)",
      ].join("\n"),
    );
  });

  it("renders one module with its path and note", () => {
    expect(formatWorkModule({ ...web, note: "Ship it" }, ["Board"], links)).toBe(
      [
        "Board › Web tab [waiting: review, due 2026-11-20, 1 thread] (id m:web)",
        "Note: Ship it",
        "Change status only after the user approves it.",
      ].join("\n"),
    );
  });
});
