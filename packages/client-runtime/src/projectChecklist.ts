import type { ProjectChecklistItem } from "@t3tools/contracts";

export type ChecklistFilter =
  | { readonly kind: "all" }
  | { readonly kind: "month" }
  | { readonly kind: "range"; readonly from: string | null; readonly to: string | null };

export interface ChecklistModuleNode {
  readonly module: ProjectChecklistItem;
  readonly items: ProjectChecklistItem[];
}

export interface ChecklistViewOptions {
  readonly filter: ChecklistFilter;
  readonly hideDone: boolean;
  /** The local calendar day, `YYYY-MM-DD`; see `localDay`. */
  readonly today: string;
}

const byPosition = (a: ProjectChecklistItem, b: ProjectChecklistItem) =>
  a.position - b.position || a.createdAt.localeCompare(b.createdAt);

/** The device's calendar day, which is what a due date means to the person looking at it. */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function buildChecklistTree(items: ReadonlyArray<ProjectChecklistItem>) {
  const children = new Map<string, ProjectChecklistItem[]>();
  for (const item of items) {
    if (item.parentId === null) continue;
    const siblings = children.get(item.parentId);
    if (siblings === undefined) children.set(item.parentId, [item]);
    else siblings.push(item);
  }
  return items
    .filter((item) => item.parentId === null)
    .sort(byPosition)
    .map((module): ChecklistModuleNode => ({
      module,
      items: (children.get(module.id) ?? []).sort(byPosition),
    }));
}

/** Open and past its due day. A finished item is never overdue. */
export function isOverdue(item: ProjectChecklistItem, today: string): boolean {
  return !item.done && item.dueDate !== null && item.dueDate < today;
}

function passesFilter(item: ProjectChecklistItem, filter: ChecklistFilter, today: string) {
  if (filter.kind === "all") return true;
  if (item.dueDate === null) return false;
  if (filter.kind === "month") return item.dueDate.slice(0, 7) === today.slice(0, 7);
  return (
    (filter.from === null || item.dueDate >= filter.from) &&
    (filter.to === null || item.dueDate <= filter.to)
  );
}

function isShown(item: ProjectChecklistItem, options: ChecklistViewOptions) {
  if (isOverdue(item, options.today)) return true;
  if (options.hideDone && item.done) return false;
  return passesFilter(item, options.filter, options.today);
}

/** Keeps a module when it or one of its items is shown; overdue items are always shown. */
export function filterChecklist(
  tree: ReadonlyArray<ChecklistModuleNode>,
  options: ChecklistViewOptions,
): ChecklistModuleNode[] {
  return tree.flatMap((node) => {
    const items = node.items.filter((item) => isShown(item, options));
    return items.length > 0 || isShown(node.module, options)
      ? [{ module: node.module, items }]
      : [];
  });
}
