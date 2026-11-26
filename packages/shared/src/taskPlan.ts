export const UPDATE_PLAN_TOOL_NAME = "update_plan";
export const TASK_PLAN_MAX_ITEMS = 12;

export type TaskPlanStatus = "pending" | "in_progress" | "completed";

export interface TaskPlanItem {
  readonly content: string;
  readonly status: TaskPlanStatus;
}

export interface TaskPlanUpdate {
  readonly items?: ReadonlyArray<TaskPlanItem> | undefined;
  readonly scope?: "first_task" | "continuation" | "new_task" | undefined;
  readonly advance?: boolean | undefined;
  readonly done?: ReadonlyArray<number> | undefined;
  readonly start?: number | undefined;
}

export type TaskPlanResult =
  | { readonly ok: true; readonly items: ReadonlyArray<TaskPlanItem> }
  | { readonly ok: false; readonly error: string };

const fail = (error: string): TaskPlanResult => ({ ok: false, error });

function checked(items: ReadonlyArray<TaskPlanItem>): TaskPlanResult {
  if (items.length < 1 || items.length > TASK_PLAN_MAX_ITEMS) {
    return fail(`A plan has 1 to ${TASK_PLAN_MAX_ITEMS} steps.`);
  }
  if (items.some((item) => item.content.length === 0)) return fail("Every step needs text.");
  if (items.filter((item) => item.status === "in_progress").length > 1) {
    return fail("At most one step can be in_progress.");
  }
  return { ok: true, items };
}

/** Applies one `update_plan` call to the caller's current plan. */
export function applyTaskPlanUpdate(
  previous: ReadonlyArray<TaskPlanItem> | undefined,
  update: TaskPlanUpdate,
): TaskPlanResult {
  const forms = [
    update.items !== undefined,
    update.advance === true,
    update.done !== undefined || update.start !== undefined,
  ].filter(Boolean).length;
  if (forms !== 1) return fail("Send exactly one of: items, advance: true, or done/start.");

  if (update.items !== undefined) {
    return checked(
      update.items.map((item) => ({ content: item.content.trim(), status: item.status })),
    );
  }
  if (previous === undefined || previous.length === 0) {
    return fail("There is no plan yet. Send the full plan with items.");
  }

  if (update.advance === true) {
    const current = previous.findIndex((item) => item.status === "in_progress");
    const next = previous.findIndex((item, index) => index > current && item.status === "pending");
    if (current < 0 && next < 0) return fail("Every step is already completed.");
    return checked(
      previous.map((item, index) =>
        index === current
          ? { ...item, status: "completed" }
          : index === next
            ? { ...item, status: "in_progress" }
            : item,
      ),
    );
  }

  const done = update.done ?? [];
  const indexes = update.start === undefined ? done : [...done, update.start];
  if (indexes.some((index) => !Number.isInteger(index) || index < 1 || index > previous.length)) {
    return fail(`Step numbers run from 1 to ${previous.length}.`);
  }
  const completed = new Set(done.map((index) => index - 1));
  const started = update.start === undefined ? undefined : update.start - 1;
  if (started !== undefined && completed.has(started)) {
    return fail("A step cannot be both done and started.");
  }
  return checked(
    previous.map((item, index): TaskPlanItem =>
      index === started
        ? { ...item, status: "in_progress" }
        : completed.has(index)
          ? { ...item, status: "completed" }
          : item,
    ),
  );
}

const STATUS_MARK: Record<TaskPlanStatus, string> = {
  pending: "[ ]",
  in_progress: "[>]",
  completed: "[x]",
};

/** The short text the model gets back. */
export function formatTaskPlan(items: ReadonlyArray<TaskPlanItem>): string {
  const done = items.filter((item) => item.status === "completed").length;
  return [
    `Plan ${done}/${items.length}:`,
    ...items.map((item, index) => `${STATUS_MARK[item.status]} ${index + 1}. ${item.content}`),
  ].join("\n");
}

const STATUSES = new Set<unknown>(["pending", "in_progress", "completed"]);

/** The plan an `update_plan` result carries, read from the tool's structured output. */
export function taskPlanItemsFromValue(value: unknown): ReadonlyArray<TaskPlanItem> | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > TASK_PLAN_MAX_ITEMS) {
    return undefined;
  }
  const items: TaskPlanItem[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return undefined;
    const content: unknown = Reflect.get(entry, "content");
    const status: unknown = Reflect.get(entry, "status");
    if (typeof content !== "string" || content.trim() === "" || !STATUSES.has(status)) {
      return undefined;
    }
    items.push({ content: content.trim(), status: status as TaskPlanStatus });
  }
  return items;
}
