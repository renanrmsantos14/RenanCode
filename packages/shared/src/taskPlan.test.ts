import { describe, expect, it } from "vite-plus/test";

import { applyTaskPlanUpdate, formatTaskPlan, type TaskPlanItem } from "./taskPlan.ts";

const plan: ReadonlyArray<TaskPlanItem> = [
  { content: "Ler o código", status: "completed" },
  { content: "Escrever o reducer", status: "in_progress" },
  { content: "Testar", status: "pending" },
  { content: "Mostrar o print", status: "pending" },
];

const statuses = (result: ReturnType<typeof applyTaskPlanUpdate>) =>
  result.ok ? result.items.map((item) => item.status) : result.error;

describe("applyTaskPlanUpdate", () => {
  it("replaces the plan with items", () => {
    const result = applyTaskPlanUpdate(plan, {
      items: [{ content: "  Nova etapa ", status: "in_progress" }],
      scope: "new_task",
    });
    expect(result).toEqual({ ok: true, items: [{ content: "Nova etapa", status: "in_progress" }] });
  });

  it("rejects more than one in_progress step and plans outside 1 to 12 steps", () => {
    expect(
      applyTaskPlanUpdate(undefined, {
        items: [
          { content: "A", status: "in_progress" },
          { content: "B", status: "in_progress" },
        ],
      }),
    ).toEqual({ ok: false, error: "At most one step can be in_progress." });
    expect(applyTaskPlanUpdate(undefined, { items: [] }).ok).toBe(false);
    const thirteen = Array.from({ length: 13 }, (_, index) => ({
      content: `Etapa ${index}`,
      status: "pending" as const,
    }));
    expect(applyTaskPlanUpdate(undefined, { items: thirteen }).ok).toBe(false);
  });

  it("advance completes the running step and starts the next pending one", () => {
    expect(statuses(applyTaskPlanUpdate(plan, { advance: true }))).toEqual([
      "completed",
      "completed",
      "in_progress",
      "pending",
    ]);
  });

  it("advance starts the first pending step when none is running", () => {
    const idle = plan.map((item, index) => (index === 1 ? { ...item, status: "pending" } : item));
    expect(statuses(applyTaskPlanUpdate(idle as TaskPlanItem[], { advance: true }))).toEqual([
      "completed",
      "in_progress",
      "pending",
      "pending",
    ]);
  });

  it("advance never goes back to an earlier pending step", () => {
    const skipped: ReadonlyArray<TaskPlanItem> = [
      { content: "A", status: "pending" },
      { content: "B", status: "in_progress" },
    ];
    expect(statuses(applyTaskPlanUpdate(skipped, { advance: true }))).toEqual([
      "pending",
      "completed",
    ]);
  });

  it("advance on the last step leaves nothing running", () => {
    const last: ReadonlyArray<TaskPlanItem> = [
      { content: "A", status: "completed" },
      { content: "B", status: "in_progress" },
    ];
    expect(statuses(applyTaskPlanUpdate(last, { advance: true }))).toEqual([
      "completed",
      "completed",
    ]);
    expect(
      applyTaskPlanUpdate(
        last.map((item) => ({ ...item, status: "completed" as const })),
        { advance: true },
      ).ok,
    ).toBe(false);
  });

  it("done and start take 1-based steps out of order", () => {
    expect(statuses(applyTaskPlanUpdate(plan, { done: [2, 4], start: 3 }))).toEqual([
      "completed",
      "completed",
      "in_progress",
      "completed",
    ]);
  });

  it("start refuses to leave two steps running", () => {
    expect(applyTaskPlanUpdate(plan, { start: 4 })).toEqual({
      ok: false,
      error: "At most one step can be in_progress.",
    });
  });

  it("rejects out-of-range steps, mixed forms, and updates without a plan", () => {
    expect(applyTaskPlanUpdate(plan, { done: [0] }).ok).toBe(false);
    expect(applyTaskPlanUpdate(plan, { done: [5] }).ok).toBe(false);
    expect(applyTaskPlanUpdate(plan, { done: [3], start: 3 }).ok).toBe(false);
    expect(applyTaskPlanUpdate(plan, { advance: true, done: [1] }).ok).toBe(false);
    expect(applyTaskPlanUpdate(plan, {}).ok).toBe(false);
    expect(applyTaskPlanUpdate(undefined, { advance: true }).ok).toBe(false);
  });
});

describe("formatTaskPlan", () => {
  it("lists every step with its status", () => {
    expect(formatTaskPlan(plan)).toBe(
      [
        "Plan 1/4:",
        "[x] 1. Ler o código",
        "[>] 2. Escrever o reducer",
        "[ ] 3. Testar",
        "[ ] 4. Mostrar o print",
      ].join("\n"),
    );
  });
});
