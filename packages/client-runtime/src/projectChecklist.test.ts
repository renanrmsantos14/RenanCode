// @effect-diagnostics globalDate:off
import { ProjectChecklistItemId, ProjectId, type ProjectChecklistItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildChecklistTree,
  filterChecklist,
  isOverdue,
  localDay,
  type ChecklistViewOptions,
} from "./projectChecklist.ts";

const project = ProjectId.make("project:app");
let counter = 0;
const item = (
  overrides: Partial<ProjectChecklistItem> & Pick<ProjectChecklistItem, "title">,
): ProjectChecklistItem => ({
  id: ProjectChecklistItemId.make(`item:${(counter += 1)}`),
  projectId: project,
  parentId: null,
  done: false,
  dueDate: null,
  position: 0,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const view = (overrides: Partial<ChecklistViewOptions> = {}): ChecklistViewOptions => ({
  filter: { kind: "all" },
  hideDone: false,
  today: "2026-11-23",
  ...overrides,
});

const titles = (nodes: ReturnType<typeof filterChecklist>) =>
  nodes.map((node) => [node.module.title, node.items.map((entry) => entry.title)]);

describe("buildChecklistTree", () => {
  it("orders modules and items by position and drops orphans", () => {
    const b = item({ title: "B", position: 1 });
    const a = item({ title: "A", position: 0 });
    const second = item({ title: "a2", parentId: a.id, position: 1 });
    const first = item({ title: "a1", parentId: a.id, position: 0 });
    const orphan = item({ title: "orphan", parentId: ProjectChecklistItemId.make("gone") });
    expect(titles(buildChecklistTree([b, second, orphan, first, a]))).toEqual([
      ["A", ["a1", "a2"]],
      ["B", []],
    ]);
  });
});

describe("localDay", () => {
  it("uses the local calendar day, not UTC", () => {
    expect(localDay(new Date(2026, 10, 3, 23, 59))).toBe("2026-11-03");
    expect(localDay(new Date(2026, 0, 9, 0, 1))).toBe("2026-01-09");
  });
});

describe("isOverdue", () => {
  it("is true only for open items due before today", () => {
    const today = "2026-11-23";
    expect(isOverdue(item({ title: "x", dueDate: "2026-11-22" }), today)).toBe(true);
    expect(isOverdue(item({ title: "x", dueDate: "2026-11-23" }), today)).toBe(false);
    expect(isOverdue(item({ title: "x" }), today)).toBe(false);
    expect(isOverdue(item({ title: "x", dueDate: "2026-10-01", done: true }), today)).toBe(false);
  });
});

describe("filterChecklist", () => {
  const module = item({ title: "Release" });
  const october = item({ title: "october", parentId: module.id, dueDate: "2026-10-30" });
  const november = item({ title: "november", parentId: module.id, dueDate: "2026-11-28" });
  const december = item({ title: "december", parentId: module.id, dueDate: "2026-12-02" });
  const noDate = item({ title: "no date", parentId: module.id });
  const tree = buildChecklistTree([module, october, november, december, noDate]);

  it("shows everything by default", () => {
    expect(titles(filterChecklist(tree, view()))).toEqual([
      ["Release", ["october", "november", "december", "no date"]],
    ]);
  });

  it("keeps an overdue October item in the November month view, and drops undated items", () => {
    expect(titles(filterChecklist(tree, view({ filter: { kind: "month" } })))).toEqual([
      ["Release", ["october", "november"]],
    ]);
  });

  it("filters by an inclusive range with open ends", () => {
    const range = (from: string | null, to: string | null) =>
      titles(filterChecklist(tree, view({ filter: { kind: "range", from, to } })));
    expect(range("2026-11-28", "2026-12-02")).toEqual([
      ["Release", ["october", "november", "december"]],
    ]);
    expect(range("2026-12-01", null)).toEqual([["Release", ["october", "december"]]]);
  });

  it("shows a module because of one of its items and hides it when none match", () => {
    const solo = buildChecklistTree([
      item({ title: "Empty" }),
      ...(() => {
        const parent = item({ title: "Later" });
        return [parent, item({ title: "far", parentId: parent.id, dueDate: "2027-03-01" })];
      })(),
    ]);
    expect(titles(filterChecklist(solo, view({ filter: { kind: "month" } })))).toEqual([]);
    const withDue = buildChecklistTree([
      item({ title: "Own", dueDate: "2026-11-30" }),
      item({ title: "Other", dueDate: "2027-03-01" }),
    ]);
    expect(titles(filterChecklist(withDue, view({ filter: { kind: "month" } })))).toEqual([
      ["Own", []],
    ]);
  });

  it("hides finished entries on request and never paints a finished one overdue", () => {
    const finished = item({
      title: "finished",
      parentId: module.id,
      done: true,
      dueDate: "2026-10-01",
    });
    const open = item({ title: "open", parentId: module.id });
    const finishedTree = buildChecklistTree([module, finished, open]);
    expect(titles(filterChecklist(finishedTree, view({ hideDone: true })))).toEqual([
      ["Release", ["open"]],
    ]);
    expect(titles(filterChecklist(finishedTree, view({ filter: { kind: "month" } })))).toEqual([]);
    expect(isOverdue(finished, "2026-11-23")).toBe(false);
  });
});
