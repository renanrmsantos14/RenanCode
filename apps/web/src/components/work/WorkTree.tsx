import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { pendingRouteOrder } from "@t3tools/client-runtime/connection";
import {
  filterWorkModuleForest,
  isOverdue,
  type WorkModuleFilters,
  type WorkModuleNode,
} from "@t3tools/client-runtime/workModuleTree";
import type { WorkModuleId } from "@t3tools/contracts";
import { ChevronRightIcon, GripVerticalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

import type { WorkBoardHandlers, WorkBoardProject } from "./useWorkBoard";
import { WorkDueDatePicker } from "./WorkDueDatePicker";
import { WorkModuleRowMenu, WorkTitleDialog } from "./WorkModuleRowMenu";
import { WorkStatusMenu } from "./WorkStatusMenu";

const COLLAPSED_KEY = "t3.work.collapsed";
const GRID = "grid grid-cols-[minmax(0,1fr)_150px_80px_64px_28px] items-center gap-2";

const readCollapsed = (): Set<string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(
      Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [],
    );
  } catch {
    return new Set();
  }
};

const projectKey = (project: WorkBoardProject) =>
  `project:${project.project.environmentId}:${project.project.id}`;

interface TreeContext extends WorkBoardHandlers {
  readonly project: WorkBoardProject;
  readonly filters: WorkModuleFilters;
  readonly draggable: boolean;
  readonly collapsed: ReadonlySet<string>;
  readonly toggle: (key: string) => void;
}

export function WorkTree(
  props: {
    projects: WorkBoardProject[];
    filters: WorkModuleFilters;
    loading: boolean;
  } & WorkBoardHandlers,
) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [creatingIn, setCreatingIn] = useState<WorkBoardProject | null>(null);
  const toggle = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {}
  };
  const filtersActive = props.filters.dueThisMonth || props.filters.hideDone;
  const withModules = props.projects.filter((project) => project.nodes.length > 0);
  const withoutModules = props.projects.filter((project) => project.nodes.length === 0);

  if (props.loading && withModules.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4" role="status" aria-label="Carregando módulos">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-7 w-full" />
        ))}
      </div>
    );
  }
  if (props.projects.length === 0) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Nenhum projeto ainda. Adicione um projeto para planejar módulos nele.
      </p>
    );
  }

  return (
    <div className="flex min-w-[560px] flex-col px-4 pb-6">
      <div className={cn(GRID, "border-b py-2 text-xs text-muted-foreground")}>
        <span>Módulo</span>
        <span>Status</span>
        <span>Prazo</span>
        <span>Threads</span>
        <span />
      </div>
      {withModules.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Nenhum módulo ainda. Crie o primeiro com “+ Módulo” ou num projeto abaixo.
        </p>
      ) : null}
      {withModules.map((project) => {
        const nodes = filterWorkModuleForest(project.nodes, props.filters);
        if (filtersActive && nodes.length === 0) return null;
        const key = projectKey(project);
        const expanded = !collapsed.has(key);
        const done = project.nodes.reduce((sum, node) => sum + node.leafDone, 0);
        const total = project.nodes.reduce((sum, node) => sum + node.leafTotal, 0);
        const context: TreeContext = {
          ...props,
          project,
          draggable: project.canWrite && !filtersActive,
          collapsed,
          toggle,
        };
        return (
          <section key={key} aria-label={project.project.title} className="border-b py-1">
            <div className="flex items-center gap-2 py-1.5">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={expanded ? "Recolher projeto" : "Expandir projeto"}
                aria-expanded={expanded}
                onClick={() => toggle(key)}
              >
                <ChevronRightIcon className={cn(expanded && "rotate-90")} />
              </Button>
              <span
                className={cn(
                  "truncate font-medium",
                  (!project.connected || project.unavailable) && "text-muted-foreground",
                )}
              >
                {project.project.title}
              </span>
              <ProgressBar done={done} total={total} />
              {project.connected && !project.unavailable ? null : (
                <Badge variant="outline" size="sm">
                  {project.unavailable ? "indisponível neste servidor" : "offline"}
                </Badge>
              )}
            </div>
            {expanded ? (
              <SiblingList context={context} nodes={nodes} parentId={null} depth={0} />
            ) : null}
          </section>
        );
      })}
      {withoutModules.length > 0 ? (
        <ul className="flex flex-col pt-3" aria-label="Projetos sem módulos">
          {withoutModules.map((project) => (
            <li key={projectKey(project)} className="flex items-center gap-2 py-1">
              <span className="truncate text-muted-foreground">{project.project.title}</span>
              {project.connected && !project.unavailable ? null : (
                <Badge variant="outline" size="sm">
                  {project.unavailable ? "indisponível neste servidor" : "offline"}
                </Badge>
              )}
              {project.canWrite ? (
                <Button variant="ghost-muted" size="xs" onClick={() => setCreatingIn(project)}>
                  <PlusIcon />
                  Adicionar primeiro módulo
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {creatingIn === null ? null : (
        <WorkTitleDialog
          title={`Primeiro módulo em ${creatingIn.project.title}`}
          submitLabel="Criar"
          onSubmit={(title) => props.onCreate(creatingIn, null, title)}
          onClose={() => setCreatingIn(null)}
        />
      )}
    </div>
  );
}

function ProgressBar(props: { done: number; total: number }) {
  if (props.total === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        role="progressbar"
        aria-label="Progresso"
        aria-valuemin={0}
        aria-valuemax={props.total}
        aria-valuenow={props.done}
        className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full rounded-full bg-success"
          style={{ width: `${(props.done / props.total) * 100}%` }}
        />
      </span>
      {props.done}/{props.total}
    </span>
  );
}

function SiblingList(props: {
  context: TreeContext;
  nodes: WorkModuleNode[];
  parentId: WorkModuleId | null;
  depth: number;
}) {
  const ids: string[] = props.nodes.map((node) => node.module.id);
  const [pending, setPending] = useState<ReadonlyArray<string> | null>(null);
  const shownPending = pendingRouteOrder(pending, ids);
  // Dropped during render so a stale order never outlives the snapshot it was for.
  if (pending !== null && shownPending === null) setPending(null);
  const order = shownPending === null ? ids : [...shownPending];
  const byId = new Map<string, WorkModuleNode>(props.nodes.map((node) => [node.module.id, node]));
  const ordered = order.flatMap((id) => byId.get(id) ?? []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (event.over === null || event.active.id === event.over.id) return;
    const node = byId.get(String(event.active.id));
    const to = order.indexOf(String(event.over.id));
    if (node === undefined || to < 0) return;
    setPending(arrayMove(order, order.indexOf(node.module.id), to));
    void props.context
      .onMove(props.context.project, node.module.id, props.parentId, to)
      .then((moved) => {
        if (!moved) setPending(null);
      });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ol>
          {ordered.map((node) => (
            <SortableModule
              key={node.module.id}
              context={props.context}
              node={node}
              depth={props.depth}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableModule(props: { context: TreeContext; node: WorkModuleNode; depth: number }) {
  const { context, node } = props;
  const { project, filters } = context;
  const workModule = node.module;
  const hasChildren = node.children.length > 0;
  const expanded = !context.collapsed.has(workModule.id);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workModule.id, disabled: !context.draggable });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 rounded-md bg-background shadow-md")}
    >
      <div className={cn(GRID, "group py-0.5")}>
        <div
          className="flex min-w-0 items-center gap-1.5"
          style={{ paddingLeft: props.depth * 20 }}
        >
          {context.draggable ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Reordenar ${workModule.title}`}
              className="flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/70 opacity-0 outline-none group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
            >
              <GripVerticalIcon className="size-3.5" />
            </button>
          ) : null}
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={
                expanded ? `Recolher ${workModule.title}` : `Expandir ${workModule.title}`
              }
              aria-expanded={expanded}
              onClick={() => context.toggle(workModule.id)}
            >
              <ChevronRightIcon className={cn(expanded && "rotate-90")} />
            </Button>
          ) : (
            <span className="size-7 shrink-0 sm:size-6" />
          )}
          <button
            type="button"
            className="min-w-0 truncate text-left text-sm hover:underline"
            onClick={() => context.onOpen(project, node)}
          >
            {workModule.title}
          </button>
          {hasChildren ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {node.leafDone}/{node.leafTotal}
            </span>
          ) : null}
          {workModule.status === "waiting" && workModule.waitingReason !== null ? (
            <span className="min-w-0 truncate text-xs text-warning-foreground">
              {workModule.waitingReason}
            </span>
          ) : null}
          {node.pendingSuggestions > 0 ? (
            <span
              role="img"
              aria-label="Thread sugerida aguardando você"
              className="size-1.5 shrink-0 rounded-full bg-info"
            />
          ) : null}
        </div>
        <div>
          <WorkStatusMenu
            status={workModule.status}
            waitingReason={workModule.waitingReason}
            disabled={!project.canWrite}
            onChange={(next) => context.onUpdate(project, { id: workModule.id, ...next })}
          />
        </div>
        <div>
          <WorkDueDatePicker
            value={workModule.dueDate}
            overdue={isOverdue(workModule, filters.today)}
            disabled={!project.canWrite}
            onChange={(dueDate) => context.onUpdate(project, { id: workModule.id, dueDate })}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {node.linkedThreadIds.length}
        </span>
        <WorkModuleRowMenu
          node={node}
          projectNodes={project.nodes}
          canWrite={project.canWrite}
          onAddChild={(title) => context.onCreate(project, workModule.id, title)}
          onRename={(title) => context.onUpdate(project, { id: workModule.id, title })}
          onMove={(parentId, index) => void context.onMove(project, workModule.id, parentId, index)}
          onNewThread={() => context.onNewThread(project, node)}
          onDelete={() => context.onDelete(project, node)}
        />
      </div>
      {hasChildren && expanded ? (
        <SiblingList
          context={context}
          nodes={node.children}
          parentId={workModule.id}
          depth={props.depth + 1}
        />
      ) : null}
    </li>
  );
}
