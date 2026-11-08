import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  filterWorkModuleForest,
  isOverdue,
  kanbanColumns,
  workModuleMatchesFilters,
  type WorkModuleFilters,
  type WorkModuleNode,
} from "@t3tools/client-runtime/workModuleTree";
import { WORK_MODULE_STATUSES, type WorkModuleStatus } from "@t3tools/contracts";
import { GripVerticalIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

import type { WorkBoardHandlers, WorkBoardProject } from "./useWorkBoard";
import { WORK_STATUS_BADGE, WORK_STATUS_LABEL } from "./workStatus";
import { WorkWaitingReasonPrompt } from "./WorkWaitingReasonPrompt";

interface KanbanEntry {
  readonly project: WorkBoardProject;
  readonly node: WorkModuleNode;
}

interface PendingWaiting {
  readonly entry: KanbanEntry;
  readonly anchor: Element | null;
}

const cardKey = (project: WorkBoardProject, node: WorkModuleNode) =>
  `${project.project.environmentId}\n${node.module.id}`;

const toStatus = (id: string): WorkModuleStatus | undefined =>
  WORK_MODULE_STATUSES.find((status) => status === id);

export function WorkKanban(
  props: { projects: WorkBoardProject[]; filters: WorkModuleFilters } & WorkBoardHandlers,
) {
  const [pending, setPending] = useState<PendingWaiting | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const entries = new Map<string, KanbanEntry>();
  const roots: WorkModuleNode[] = [];
  for (const project of props.projects) {
    const nodes = filterWorkModuleForest(project.nodes, props.filters);
    roots.push(...nodes);
    const walk = (list: WorkModuleNode[]) => {
      for (const node of list) {
        entries.set(cardKey(project, node), { project, node });
        walk(node.children);
      }
    };
    walk(nodes);
  }
  const columns = kanbanColumns(roots);
  for (const status of WORK_MODULE_STATUSES) {
    columns[status] = columns[status].filter((node) =>
      workModuleMatchesFilters(node.module, props.filters),
    );
  }

  // Module ids are unique per environment, so resolve each column node back to its project.
  const projectOf = new Map<string, WorkBoardProject>();
  for (const entry of entries.values()) projectOf.set(entry.node.module.id, entry.project);

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.over === null) return;
    const status = toStatus(String(event.over.id));
    const entry = entries.get(String(event.active.id));
    if (status === undefined || entry === undefined || entry.node.module.status === status) return;
    if (status === "waiting") {
      const target = event.activatorEvent.target;
      setPending({ entry, anchor: target instanceof Element ? target : null });
      return;
    }
    props.onUpdate(entry.project, { id: entry.node.module.id, status });
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid min-w-[880px] grid-cols-4 gap-3 p-4">
        {WORK_MODULE_STATUSES.map((status) => (
          <KanbanColumn key={status} status={status} count={columns[status].length}>
            {columns[status].map((node) => {
              const project = projectOf.get(node.module.id);
              const entry = project === undefined ? undefined : entries.get(cardKey(project, node));
              return entry === undefined ? null : (
                <KanbanCard
                  key={cardKey(entry.project, node)}
                  entry={entry}
                  today={props.filters.today}
                  onOpen={props.onOpen}
                />
              );
            })}
          </KanbanColumn>
        ))}
      </div>
      {pending === null ? null : (
        <WorkWaitingReasonPrompt
          open
          initial={pending.entry.node.module.waitingReason ?? ""}
          anchor={pending.anchor}
          onSubmit={(waitingReason) => {
            props.onUpdate(pending.entry.project, {
              id: pending.entry.node.module.id,
              status: "waiting",
              waitingReason,
            });
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </DndContext>
  );
}

function KanbanColumn(props: { status: WorkModuleStatus; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: props.status });
  return (
    <section
      ref={setNodeRef}
      aria-label={WORK_STATUS_LABEL[props.status]}
      className={cn(
        "flex min-h-40 flex-col gap-2 rounded-lg border bg-muted/30 p-2",
        isOver && "bg-accent/50",
      )}
    >
      <header className="flex items-center gap-2 px-1 text-sm font-medium">
        <Badge variant={WORK_STATUS_BADGE[props.status]} size="sm">
          {WORK_STATUS_LABEL[props.status]}
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{props.count}</span>
      </header>
      {props.children}
    </section>
  );
}

function KanbanCard(props: {
  entry: KanbanEntry;
  today: string;
  onOpen: WorkBoardHandlers["onOpen"];
}) {
  const { project, node } = props.entry;
  const workModule = node.module;
  const draggable = project.canWrite;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: cardKey(project, node), disabled: !draggable });
  const path = [project.project.title, ...node.ancestorTitles].join(" › ");
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "group flex flex-col gap-1 rounded-md border bg-card p-2 text-card-foreground",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      <div className="flex items-start gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-xs text-muted-foreground">{path}</span>
          <button
            type="button"
            className="min-w-0 text-left text-sm hover:underline"
            onClick={() => props.onOpen(project, node)}
          >
            {workModule.title}
          </button>
        </div>
        {draggable ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Mover ${workModule.title}`}
            className="flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      {workModule.status === "waiting" && workModule.waitingReason !== null ? (
        <span className="text-xs text-warning-foreground">{workModule.waitingReason}</span>
      ) : null}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {workModule.dueDate === null ? null : (
          <span className={cn(isOverdue(workModule, props.today) && "text-destructive-foreground")}>
            {workModule.dueDate}
          </span>
        )}
        <span className="ms-auto tabular-nums">
          {node.threadIds.length} {node.threadIds.length === 1 ? "thread" : "threads"}
        </span>
      </div>
    </article>
  );
}
