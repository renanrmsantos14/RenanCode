import {
  ProjectId,
  ThreadId,
  type WorkModule,
  WorkModuleId,
  type WorkModuleSnapshot,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildWorkModuleForest,
  filterWorkModuleForest,
  isOverdue,
  joinAgentNote,
  kanbanColumns,
  splitAgentNote,
  workModuleMatchesFilters,
} from "./workModuleTree.ts";

const app = ProjectId.make("project:app");
const at = "2026-11-01T00:00:00.000Z";
const mod = (
  id: string,
  parentId: string | null,
  position: number,
  extra: Partial<WorkModule> = {},
): WorkModule => ({
  id: WorkModuleId.make(id),
  projectId: app,
  parentId: parentId === null ? null : WorkModuleId.make(parentId),
  title: id,
  note: "",
  status: "active",
  waitingReason: null,
  dueDate: null,
  position,
  statusChangedAt: at,
  createdAt: at,
  updatedAt: at,
  ...extra,
});

const snapshot: WorkModuleSnapshot = {
  modules: [
    mod("board", null, 1),
    mod("usage", null, 0, { status: "done" }),
    mod("web", "board", 0, { dueDate: "2026-11-20" }),
    mod("model", "board", 1, { status: "done" }),
    mod("mobile", "board", 2, { status: "idea", dueDate: "2026-12-05" }),
  ],
  links: [
    {
      threadId: ThreadId.make("t:1"),
      moduleId: WorkModuleId.make("web"),
      suggested: false,
      linkedAt: at,
    },
    {
      threadId: ThreadId.make("t:2"),
      moduleId: WorkModuleId.make("web"),
      suggested: true,
      linkedAt: at,
    },
  ],
};

describe("work module tree", () => {
  it("nests by parent, orders by position and rolls up leaf progress", () => {
    const [usage, board] = buildWorkModuleForest(snapshot).get(app)!;
    expect([usage!.module.title, board!.module.title]).toEqual(["usage", "board"]);
    expect(board!.children.map((n) => n.module.title)).toEqual(["web", "model", "mobile"]);
    expect([board!.leafDone, board!.leafTotal]).toEqual([1, 3]);
    const web = board!.children[0]!;
    expect(web.ancestorTitles).toEqual(["board"]);
    expect(web.linkedThreadIds).toEqual([ThreadId.make("t:1")]);
    expect(web.pendingSuggestions).toBe(1);
  });

  it("keeps ancestors of matches when filtering", () => {
    const forest = buildWorkModuleForest(snapshot).get(app)!;
    const thisMonth = filterWorkModuleForest(forest, {
      dueThisMonth: true,
      hideDone: false,
      today: "2026-11-08",
    });
    expect(thisMonth.map((n) => n.module.title)).toEqual(["board"]);
    expect(thisMonth[0]!.children.map((n) => n.module.title)).toEqual(["web"]);
    const open = filterWorkModuleForest(forest, {
      dueThisMonth: false,
      hideDone: true,
      today: "2026-11-08",
    });
    expect(open.map((n) => n.module.title)).toEqual(["board"]);
    expect(open[0]!.children.map((n) => n.module.title)).toEqual(["web", "mobile"]);

    const doneParent = buildWorkModuleForest({
      modules: [mod("p", null, 0, { status: "done" }), mod("c", "p", 0)],
      links: [],
    }).get(app)!;
    const hidden = filterWorkModuleForest(doneParent, {
      dueThisMonth: false,
      hideDone: true,
      today: "2026-11-08",
    });
    expect(hidden.map((n) => n.module.title)).toEqual(["p"]);
    expect(hidden[0]!.children.map((n) => n.module.title)).toEqual(["c"]);
    const filters = { dueThisMonth: false, hideDone: true, today: "2026-11-08" };
    expect(workModuleMatchesFilters(doneParent[0]!.module, filters)).toBe(false);
    expect(workModuleMatchesFilters(doneParent[0]!.children[0]!.module, filters)).toBe(true);
  });

  it("flattens into status columns ordered by due date, then tree order", () => {
    const forest = buildWorkModuleForest(snapshot).get(app)!;
    const columns = kanbanColumns(forest);
    expect(columns.active.map((n) => n.module.title)).toEqual(["web", "board"]);
    expect(columns.done.map((n) => n.module.title)).toEqual(["usage", "model"]);
    expect(columns.idea.map((n) => n.module.title)).toEqual(["mobile"]);
  });

  it("marks only unfinished modules past their date as overdue", () => {
    expect(isOverdue(mod("a", null, 0, { dueDate: "2026-11-06" }), "2026-11-08")).toBe(true);
    expect(
      isOverdue(mod("a", null, 0, { dueDate: "2026-11-06", status: "done" }), "2026-11-08"),
    ).toBe(false);
    expect(isOverdue(mod("a", null, 0, { dueDate: "2026-11-08" }), "2026-11-08")).toBe(false);
  });

  it("keeps agent lines out of the editable note and back in on save", () => {
    const note = "Mine\n\n2026-11-08 · agent: PR opened\n2026-11-09 · agent: CI green";
    const { text, agentLines } = splitAgentNote(note);
    expect(text).toBe("Mine");
    expect(agentLines).toEqual(["2026-11-08 · agent: PR opened", "2026-11-09 · agent: CI green"]);
    expect(joinAgentNote("Mine edited ", agentLines)).toBe(
      "Mine edited\n2026-11-08 · agent: PR opened\n2026-11-09 · agent: CI green",
    );
    expect(joinAgentNote("", agentLines)).toBe(agentLines.join("\n"));
  });
});
