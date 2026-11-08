import {
  type ProjectId,
  type ThreadId,
  WORK_MODULE_STATUSES,
  type WorkModule,
  type WorkModuleSnapshot,
  type WorkModuleStatus,
} from "@t3tools/contracts";

export interface WorkModuleNode {
  readonly module: WorkModule;
  readonly children: WorkModuleNode[];
  readonly ancestorTitles: string[];
  readonly threadIds: ThreadId[];
  readonly pendingSuggestions: number;
  readonly leafTotal: number;
  readonly leafDone: number;
  /** Pre-order index across the project, used as the kanban tiebreak. */
  readonly order: number;
}

export interface WorkModuleFilters {
  readonly dueThisMonth: boolean;
  readonly hideDone: boolean;
  readonly today: string;
}

export function buildWorkModuleForest(
  snapshot: WorkModuleSnapshot,
): Map<ProjectId, WorkModuleNode[]> {
  const byParent = new Map<string, WorkModule[]>();
  for (const module of snapshot.modules) {
    const key = `${module.projectId}\n${module.parentId ?? ""}`;
    const list = byParent.get(key) ?? [];
    list.push(module);
    byParent.set(key, list);
  }
  const linksByModule = new Map<string, WorkModuleSnapshot["links"][number][]>();
  for (const link of snapshot.links) {
    const list = linksByModule.get(link.moduleId) ?? [];
    list.push(link);
    linksByModule.set(link.moduleId, list);
  }
  const forest = new Map<ProjectId, WorkModuleNode[]>();
  const projects = new Set(snapshot.modules.map((m) => m.projectId));
  for (const projectId of projects) {
    let counter = 0;
    const build = (parentId: string, ancestorTitles: string[]): WorkModuleNode[] =>
      (byParent.get(`${projectId}\n${parentId}`) ?? [])
        .sort((a, b) => a.position - b.position)
        .map((module) => {
          const order = counter++;
          const children = build(module.id, [...ancestorTitles, module.title]);
          const links = linksByModule.get(module.id) ?? [];
          const isLeaf = children.length === 0;
          return {
            module,
            children,
            ancestorTitles,
            threadIds: links.map((link) => link.threadId),
            pendingSuggestions: links.filter((link) => link.suggested).length,
            leafTotal: isLeaf ? 1 : children.reduce((sum, c) => sum + c.leafTotal, 0),
            leafDone: isLeaf
              ? module.status === "done"
                ? 1
                : 0
              : children.reduce((sum, c) => sum + c.leafDone, 0),
            order,
          };
        });
    forest.set(projectId, build("", []));
  }
  return forest;
}

export const workModuleMatchesFilters = (module: WorkModule, filters: WorkModuleFilters) => {
  if (filters.hideDone && module.status === "done") return false;
  if (filters.dueThisMonth) {
    if (module.dueDate === null) return false;
    const sameMonth = module.dueDate.slice(0, 7) === filters.today.slice(0, 7);
    return sameMonth || isOverdue(module, filters.today);
  }
  return true;
};

export function filterWorkModuleForest(
  nodes: WorkModuleNode[],
  filters: WorkModuleFilters,
): WorkModuleNode[] {
  if (!filters.dueThisMonth && !filters.hideDone) return nodes;
  return nodes.flatMap((node) => {
    const children = filterWorkModuleForest(node.children, filters);
    if (workModuleMatchesFilters(node.module, filters)) return [{ ...node, children }];
    if (children.length > 0) {
      return [{ ...node, children }];
    }
    return [];
  });
}

export function kanbanColumns(nodes: WorkModuleNode[]): Record<WorkModuleStatus, WorkModuleNode[]> {
  const columns = Object.fromEntries(
    WORK_MODULE_STATUSES.map((s) => [s, [] as WorkModuleNode[]]),
  ) as Record<WorkModuleStatus, WorkModuleNode[]>;
  const walk = (list: WorkModuleNode[]) => {
    for (const node of list) {
      columns[node.module.status].push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  for (const status of WORK_MODULE_STATUSES) {
    columns[status].sort((a, b) => {
      const da = a.module.dueDate ?? "9999-99-99";
      const db = b.module.dueDate ?? "9999-99-99";
      return da === db ? a.order - b.order : da < db ? -1 : 1;
    });
  }
  return columns;
}

export function isOverdue(module: WorkModule, today: string): boolean {
  return module.status !== "done" && module.dueDate !== null && module.dueDate < today;
}
