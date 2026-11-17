import type { WorkModule, WorkModuleThreadLink } from "@t3tools/contracts";

const detail = (module: WorkModule, links: ReadonlyArray<WorkModuleThreadLink>) => {
  const parts: string[] = [
    module.status === "waiting" ? `waiting: ${module.waitingReason}` : module.status,
  ];
  if (module.dueDate !== null) parts.push(`due ${module.dueDate}`);
  const count = links.filter((link) => link.moduleId === module.id).length;
  if (count > 0) parts.push(`${count} thread${count === 1 ? "" : "s"}`);
  return `${module.title} [${parts.join(", ")}] (id ${module.id})`;
};

export function formatWorkModuleTree(
  modules: ReadonlyArray<WorkModule>,
  links: ReadonlyArray<WorkModuleThreadLink>,
): string {
  const children = (parentId: WorkModule["parentId"]) =>
    modules.filter((m) => m.parentId === parentId).sort((a, b) => a.position - b.position);
  const lines: string[] = [];
  const walk = (parentId: WorkModule["parentId"], depth: number) => {
    for (const module of children(parentId)) {
      lines.push(`${"  ".repeat(depth)}- ${detail(module, links)}`);
      walk(module.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.length === 0 ? "This project has no modules yet." : lines.join("\n");
}

export function formatWorkModule(
  module: WorkModule,
  ancestorTitles: ReadonlyArray<string>,
  links: ReadonlyArray<WorkModuleThreadLink>,
): string {
  const lines = [[...ancestorTitles, detail(module, links)].join(" › ")];
  if (module.note.length > 0) lines.push(`Note: ${module.note}`);
  lines.push("Change status or confirm links only after the user approves it.");
  return lines.join("\n");
}
