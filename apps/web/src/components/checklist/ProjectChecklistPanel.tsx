import { useAtomValue } from "@effect/atom-react";
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  buildChecklistTree,
  type ChecklistFilter,
  type ChecklistModuleNode,
  filterChecklist,
  isOverdue,
  localDay,
} from "@t3tools/client-runtime/projectChecklist";
import type {
  EnvironmentId,
  ProjectChecklistItem,
  ProjectChecklistItemId,
  ProjectChecklistUpsertInput,
  ProjectId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { T, useGT } from "gt-react";
import { EyeOffIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Toggle } from "~/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { WorkDueDatePicker } from "~/components/work/WorkDueDatePicker";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { projectChecklistEnvironment } from "~/state/projectChecklist";
import { useAtomCommand } from "~/state/use-atom-command";

export interface ChecklistPrefs {
  readonly filter: ChecklistFilter;
  readonly hideDone: boolean;
}

const DEFAULT_PREFS: ChecklistPrefs = { filter: { kind: "all" }, hideDone: false };
const prefsKey = (environmentId: EnvironmentId, projectId: ProjectId) =>
  `t3.checklist.prefs:${environmentId}:${projectId}`;

const isoDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function readPrefs(key: string): ChecklistPrefs {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof raw !== "object" || raw === null) return DEFAULT_PREFS;
    const { filter, hideDone } = raw as { filter?: Record<string, unknown>; hideDone?: unknown };
    const kind = filter?.kind;
    return {
      hideDone: hideDone === true,
      filter:
        kind === "month"
          ? { kind }
          : kind === "range"
            ? {
                kind,
                from: isoDay(filter?.from) ? filter.from : null,
                to: isoDay(filter?.to) ? filter.to : null,
              }
            : { kind: "all" },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(key: string, prefs: ChecklistPrefs) {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {}
}

type Draft = { readonly parentId: ProjectChecklistItemId | null } | null;

interface PanelContext {
  readonly canWrite: boolean;
  readonly today: string;
  readonly siblingIds: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly update: (input: Omit<ProjectChecklistUpsertInput, "projectId">) => Promise<boolean>;
  readonly move: (id: ProjectChecklistItemId, index: number) => void;
  readonly requestDelete: (item: ProjectChecklistItem, childCount: number) => void;
  readonly startDraft: (parentId: ProjectChecklistItemId | null) => void;
}

function TitleEditor(props: {
  initialValue: string;
  placeholder?: string;
  label: string;
  onCommit: (title: string) => Promise<boolean> | boolean;
  clearOnCommit?: boolean;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initialValue);
  const [saving, setSaving] = useState(false);
  const [rejectedEmpty, setRejectedEmpty] = useState(false);
  const trimmed = value.trim();
  const commit = async () => {
    if (trimmed === "") {
      setRejectedEmpty(true);
      return;
    }
    if (saving) return;
    setSaving(true);
    const ok = await props.onCommit(trimmed);
    setSaving(false);
    if (ok && props.clearOnCommit) setValue("");
  };
  return (
    <Input
      autoFocus
      nativeInput
      size="sm"
      value={value}
      aria-label={props.label}
      aria-invalid={rejectedEmpty && trimmed === ""}
      placeholder={props.placeholder}
      onChange={(event) => {
        setValue(event.target.value);
        setRejectedEmpty(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          props.onCancel();
        }
      }}
      onBlur={() => {
        if (trimmed === "" || trimmed === props.initialValue) props.onCancel();
        else void commit();
      }}
    />
  );
}

// Collapsed (not just transparent) so titles get the full width in the narrow details card;
// still tabbable, and always shown on touch screens.
const REVEAL_ON_HOVER =
  "max-w-0 overflow-hidden group-hover:max-w-none group-focus-within:max-w-none [@media(hover:none)]:max-w-none";

function ChecklistRow(props: {
  context: PanelContext;
  item: ProjectChecklistItem;
  childCount: number;
  isModule: boolean;
  children?: React.ReactNode;
}) {
  const gt = useGT();
  const { context, item } = props;
  const [editing, setEditing] = useState(false);
  const overdue = isOverdue(item, context.today);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !context.canWrite });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 rounded-md bg-background shadow-md")}
    >
      <div
        data-testid={props.isModule ? "checklist-module" : "checklist-item"}
        data-overdue={overdue ? "true" : undefined}
        className={cn("group flex items-start gap-1 rounded-md pe-0.5", !props.isModule && "ps-4")}
      >
        {context.canWrite ? (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={gt("Reorder {title}", { title: item.title })}
            className="flex h-5 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/70 opacity-0 outline-none group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-3.5" />
          </button>
        ) : null}
        <Checkbox
          checked={item.done}
          disabled={!context.canWrite}
          aria-label={gt("Mark {title} as done", { title: item.title })}
          onCheckedChange={(checked) => void context.update({ id: item.id, done: checked })}
        />
        <div className="min-w-0 flex-1 self-center py-0.5">
          {editing ? (
            <TitleEditor
              initialValue={item.title}
              label={gt("Title")}
              onCancel={() => setEditing(false)}
              onCommit={async (title) => {
                const ok = title === item.title || (await context.update({ id: item.id, title }));
                if (ok) {
                  setEditing(false);
                  if (!props.isModule) context.startDraft(item.parentId);
                }
                return ok;
              }}
            />
          ) : (
            <button
              type="button"
              disabled={!context.canWrite}
              className={cn(
                "block w-full text-left text-sm leading-5 break-words disabled:cursor-default",
                props.isModule && "font-medium",
                item.done && "text-muted-foreground line-through",
                overdue && "text-destructive",
              )}
              onClick={() => setEditing(true)}
            >
              {item.title}
            </button>
          )}
        </div>
        <div className={cn("flex shrink-0", item.dueDate === null && REVEAL_ON_HOVER)}>
          <WorkDueDatePicker
            size="xs"
            value={item.dueDate}
            overdue={overdue}
            disabled={!context.canWrite}
            onChange={(dueDate) => void context.update({ id: item.id, dueDate })}
          />
        </div>
        {context.canWrite ? (
          <div className={cn("flex shrink-0", REVEAL_ON_HOVER)}>
            {props.isModule ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={gt("Add item to {title}", { title: item.title })}
                onClick={() => context.startDraft(item.id)}
              >
                <PlusIcon />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={gt("Delete {title}", { title: item.title })}
              onClick={() => context.requestDelete(item, props.childCount)}
            >
              <Trash2Icon />
            </Button>
          </div>
        ) : null}
      </div>
      {props.children}
    </div>
  );
}

function SortableGroup(props: {
  context: PanelContext;
  parentKey: string;
  visibleIds: ReadonlyArray<string>;
  children: React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (event: DragEndEvent) => {
    if (event.over === null || event.active.id === event.over.id) return;
    const siblings = props.context.siblingIds.get(props.parentKey) ?? [];
    const index = siblings.indexOf(String(event.over.id));
    if (index < 0) return;
    props.context.move(String(event.active.id) as ProjectChecklistItemId, index);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={[...props.visibleIds]} strategy={verticalListSortingStrategy}>
        {props.children}
      </SortableContext>
    </DndContext>
  );
}

function DraftRow(props: {
  context: PanelContext;
  parentId: ProjectChecklistItemId | null;
  onClose: () => void;
}) {
  const gt = useGT();
  return (
    <div className={cn(props.parentId !== null && "ps-4")}>
      <TitleEditor
        initialValue=""
        clearOnCommit
        label={props.parentId === null ? gt("New module title") : gt("New item title")}
        placeholder={props.parentId === null ? gt("Module title") : gt("Item title")}
        onCancel={props.onClose}
        onCommit={(title) => props.context.update({ parentId: props.parentId, title })}
      />
    </div>
  );
}

export function ProjectChecklistPanel(props: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
}) {
  const { environmentId, projectId } = props;
  const key = prefsKey(environmentId, projectId);
  const [prefs, setPrefs] = useState(() => ({ key, value: readPrefs(key) }));
  if (prefs.key !== key) setPrefs({ key, value: readPrefs(key) });
  const nowMinute = useNowMinute();

  const result = useAtomValue(
    projectChecklistEnvironment.live({ environmentId, input: { projectId } }),
  );
  const snapshot = AsyncResult.getOrElse(result, () => null);
  const canWrite = useAtomValue(projectChecklistEnvironment.upsert.permissionAtom(environmentId));
  const upsert = useAtomCommand(projectChecklistEnvironment.upsert, {
    label: "project checklist save",
  });
  const move = useAtomCommand(projectChecklistEnvironment.move, {
    label: "project checklist move",
  });
  const remove = useAtomCommand(projectChecklistEnvironment.remove, {
    label: "project checklist delete",
  });

  if (snapshot === null) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {result._tag === "Failure" ? <T>The checklist could not be loaded.</T> : <T>Loading…</T>}
      </div>
    );
  }
  return (
    <ProjectChecklistView
      items={snapshot.items}
      canWrite={canWrite === true}
      today={localDay(new Date(`${nowMinute}Z`))}
      prefs={prefs.value}
      onPrefsChange={(next) => {
        setPrefs({ key, value: next });
        writePrefs(key, next);
      }}
      onUpdate={async (input) =>
        (await upsert({ environmentId, input: { ...input, projectId } }))._tag === "Success"
      }
      onMove={(id, index) => void move({ environmentId, input: { id, index } })}
      onDelete={(id) => void remove({ environmentId, input: { id } })}
    />
  );
}

export function ProjectChecklistView(props: {
  items: ReadonlyArray<ProjectChecklistItem>;
  canWrite: boolean;
  today: string;
  prefs: ChecklistPrefs;
  onPrefsChange: (prefs: ChecklistPrefs) => void;
  /** Resolves false when the server rejected the change. */
  onUpdate: (input: Omit<ProjectChecklistUpsertInput, "projectId">) => Promise<boolean>;
  onMove: (id: ProjectChecklistItemId, index: number) => void;
  onDelete: (id: ProjectChecklistItemId) => void;
}) {
  const gt = useGT();
  const { today } = props;
  const { filter, hideDone } = props.prefs;
  const changePrefs = props.onPrefsChange;
  const [draft, setDraft] = useState<Draft>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    item: ProjectChecklistItem;
    childCount: number;
  } | null>(null);

  const tree = buildChecklistTree(props.items);
  const shown = filterChecklist(tree, { filter, hideDone, today });
  const siblingIds = new Map<string, ReadonlyArray<string>>([
    ["root", tree.map((node) => node.module.id)],
    ...tree.map((node) => [node.module.id, node.items.map((item) => item.id)] as const),
  ]);

  const context: PanelContext = {
    canWrite: props.canWrite,
    today,
    siblingIds,
    update: props.onUpdate,
    move: props.onMove,
    requestDelete: (item, childCount) => {
      if (childCount === 0) props.onDelete(item.id);
      else setPendingDelete({ item, childCount });
    },
    startDraft: (parentId) => setDraft({ parentId }),
  };

  const dateFilterActive = filter.kind !== "all";
  const totalChildren = new Map(tree.map((node) => [node.module.id, node.items.length] as const));
  const renderModule = (node: ChecklistModuleNode) => (
    <ChecklistRow
      key={node.module.id}
      context={context}
      item={node.module}
      childCount={totalChildren.get(node.module.id) ?? 0}
      isModule
    >
      <SortableGroup
        context={context}
        parentKey={node.module.id}
        visibleIds={node.items.map((item) => item.id)}
      >
        {node.items.map((item) => (
          <ChecklistRow
            key={item.id}
            context={context}
            item={item}
            childCount={0}
            isModule={false}
          />
        ))}
      </SortableGroup>
      {draft?.parentId === node.module.id ? (
        <DraftRow context={context} parentId={node.module.id} onClose={() => setDraft(null)} />
      ) : null}
    </ChecklistRow>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="project-checklist">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToggleGroup
          aria-label={gt("Filter")}
          value={[filter.kind]}
          onValueChange={(next) => {
            const kind = next[0];
            if (kind === "all") changePrefs({ filter: { kind }, hideDone });
            else if (kind === "month") changePrefs({ filter: { kind }, hideDone });
            else if (kind === "range") {
              changePrefs({
                filter: filter.kind === "range" ? filter : { kind, from: null, to: null },
                hideDone,
              });
            }
          }}
        >
          <ToggleGroupItem value="all">
            <T>All</T>
          </ToggleGroupItem>
          <ToggleGroupItem value="month">
            <T>This month</T>
          </ToggleGroupItem>
          <ToggleGroupItem value="range">
            <T>Range</T>
          </ToggleGroupItem>
        </ToggleGroup>
        <Toggle
          size="xs"
          pressed={hideDone}
          aria-label={gt("Hide completed")}
          title={gt("Hide completed")}
          onPressedChange={(pressed) => changePrefs({ filter, hideDone: pressed })}
        >
          <EyeOffIcon />
        </Toggle>
        {filter.kind === "range" ? (
          <div className="order-last grid basis-full grid-cols-2 gap-1">
            <Input
              nativeInput
              size="sm"
              type="date"
              aria-label={gt("From")}
              value={filter.from ?? ""}
              onChange={(event) =>
                changePrefs({
                  filter: {
                    ...filter,
                    from: event.target.value === "" ? null : event.target.value,
                  },
                  hideDone,
                })
              }
            />
            <Input
              nativeInput
              size="sm"
              type="date"
              aria-label={gt("To")}
              value={filter.to ?? ""}
              onChange={(event) =>
                changePrefs({
                  filter: { ...filter, to: event.target.value === "" ? null : event.target.value },
                  hideDone,
                })
              }
            />
          </div>
        ) : null}
        {context.canWrite ? (
          <Button
            className="ms-auto"
            size="icon-xs"
            variant="ghost"
            aria-label={gt("Add module")}
            title={gt("Add module")}
            onClick={() => context.startDraft(null)}
          >
            <PlusIcon />
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
        {tree.length === 0 && draft === null ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <T>No checklist yet.</T>
            {context.canWrite ? (
              <Button size="sm" variant="outline" onClick={() => context.startDraft(null)}>
                <PlusIcon />
                <T>Add module</T>
              </Button>
            ) : null}
          </div>
        ) : shown.length === 0 && draft === null ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {dateFilterActive ? (
              <T>Nothing due in this period.</T>
            ) : (
              <T>Everything here is completed.</T>
            )}
          </p>
        ) : (
          <SortableGroup
            context={context}
            parentKey="root"
            visibleIds={shown.map((node) => node.module.id)}
          >
            {shown.map(renderModule)}
          </SortableGroup>
        )}
        {draft?.parentId === null ? (
          <DraftRow context={context} parentId={null} onClose={() => setDraft(null)} />
        ) : null}
      </div>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete === null
                ? ""
                : gt(
                    "{count, plural, one {Delete {title} and {count} item?} other {Delete {title} and {count} items?}}",
                    { title: pendingDelete.item.title, count: pendingDelete.childCount },
                  )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <T>This cannot be undone.</T>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              <T>Cancel</T>
            </AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                const id = pendingDelete?.item.id;
                setPendingDelete(null);
                if (id !== undefined) props.onDelete(id);
              }}
            >
              <T>Delete</T>
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
