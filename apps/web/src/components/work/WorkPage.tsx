import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { WorkModuleNode } from "@t3tools/client-runtime/workModuleTree";
import type { WorkModuleId, WorkModuleUpsertInput } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { CheckIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SidebarInset } from "~/components/ui/sidebar";
import { Toggle } from "~/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { isElectron } from "~/env";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { useAtomCommand } from "~/state/use-atom-command";
import { workModuleEnvironment } from "~/state/workModules";

import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { useWorkBoard, type WorkBoardHandlers, type WorkBoardProject } from "./useWorkBoard";
import { WorkKanban } from "./WorkKanban";
import { WorkModulePanel } from "./WorkModulePanel";
import { WorkTitleDialog } from "./WorkModuleRowMenu";
import { WorkTree } from "./WorkTree";

type View = "tree" | "kanban";
const VIEW_KEY = "t3.work.view";
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "kanban" ? "kanban" : "tree";
  } catch {
    return "tree";
  }
};

const ALL_PROJECTS = "all";
const LAST_PROJECT_KEY = "t3.work.lastProject";
const readLastProject = () => {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
};

const moduleThreadPrompt = (path: string[], note: string) =>
  [`Módulo: ${path.join(" › ")}`, note.trim() === "" ? null : `Nota: ${note.trim()}`]
    .filter((line) => line !== null)
    .join("\n") + "\n\n";

const boardProjectKey = (project: WorkBoardProject) =>
  `${project.project.environmentId}:${project.project.id}`;

function CreateModuleDialog(props: {
  projects: WorkBoardProject[];
  /** The filtered project, else the last one used, else the first that already has modules. */
  preferredKey: string | null;
  onCreate: (project: WorkBoardProject, title: string) => void;
  onClose: () => void;
}) {
  const gt = useGT();
  const [selectedKey, setSelectedKey] = useState(() => {
    const keys = props.projects.map(boardProjectKey);
    const preferred = [props.preferredKey, readLastProject()].find(
      (key) => key !== null && keys.includes(key),
    );
    const withModules = props.projects.find((project) => project.nodes.length > 0);
    return preferred ?? (withModules === undefined ? keys[0] : boardProjectKey(withModules)) ?? "";
  });
  const selected = props.projects.find((project) => boardProjectKey(project) === selectedKey);
  return (
    <WorkTitleDialog
      title={gt("New module")}
      submitLabel={gt("Create")}
      canSubmit={selected !== undefined}
      onSubmit={(title) => {
        if (selected !== undefined) props.onCreate(selected, title);
      }}
      onClose={props.onClose}
    >
      <Select
        value={selectedKey}
        onValueChange={(value) => {
          if (typeof value === "string") setSelectedKey(value);
        }}
      >
        <SelectTrigger aria-label={gt("Project")}>
          <SelectValue>{selected?.project.title ?? gt("Choose a project")}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {props.projects.map((project) => (
            <SelectItem key={boardProjectKey(project)} value={boardProjectKey(project)}>
              {project.project.title}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </WorkTitleDialog>
  );
}

export function WorkPage() {
  const gt = useGT();
  const board = useWorkBoard();
  const nowMinute = useNowMinute();
  const [view, setView] = useState<View>(readView);
  const [dueThisMonth, setDueThisMonth] = useState(false);
  const [hideDone, setHideDone] = useState(false);
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<{ project: WorkBoardProject; moduleId: WorkModuleId } | null>(
    null,
  );
  const upsert = useAtomCommand(workModuleEnvironment.upsert, { label: "work module save" });
  const move = useAtomCommand(workModuleEnvironment.move, { label: "work module move" });
  const remove = useAtomCommand(workModuleEnvironment.remove, { label: "work module delete" });
  const handleNewThread = useNewThreadHandler();
  // Local calendar day of the minute tick, so "today" rolls over at local midnight.
  const today = new Date(`${nowMinute}Z`).toLocaleDateString("sv-SE");
  const filters = { dueThisMonth, hideDone, today };
  const writableProjects = board.projects.filter((project) => project.canWrite);
  const filteredProject = board.projects.find(
    (project) => boardProjectKey(project) === projectFilter,
  );
  const shownProjects = filteredProject === undefined ? board.projects : [filteredProject];
  const openProject =
    open === null
      ? undefined
      : (board.projects.find(
          (project) => boardProjectKey(project) === boardProjectKey(open.project),
        ) ?? open.project);

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {}
  };
  const update = (project: WorkBoardProject, input: Omit<WorkModuleUpsertInput, "projectId">) =>
    void upsert({
      environmentId: project.project.environmentId,
      input: { ...input, projectId: project.project.id },
    });
  const create = (project: WorkBoardProject, parentId: WorkModuleId | null, title: string) =>
    update(project, { parentId, title });
  const createAndOpen = async (project: WorkBoardProject, title: string) => {
    try {
      localStorage.setItem(LAST_PROJECT_KEY, boardProjectKey(project));
    } catch {}
    const result = await upsert({
      environmentId: project.project.environmentId,
      input: { projectId: project.project.id, parentId: null, title },
    });
    if (result._tag === "Success") setOpen({ project, moduleId: result.value.id });
  };
  const startThreadInModule = async (project: WorkBoardProject, node: WorkModuleNode) => {
    const opened = await handleNewThread(
      scopeProjectRef(project.project.environmentId, project.project.id),
      {
        prompt: moduleThreadPrompt(
          [project.project.title, ...node.ancestorTitles, node.module.title],
          node.module.note,
        ),
      },
    );
    if (opened !== null) {
      useComposerDraftStore.getState().setDraftWorkModule(opened.draftId, node.module.id);
    }
  };
  const handlers: WorkBoardHandlers = {
    onUpdate: update,
    onCreate: create,
    onMove: (project, id, parentId, index) =>
      move({ environmentId: project.project.environmentId, input: { id, parentId, index } }).then(
        (result) => result._tag === "Success",
      ),
    onDelete: (project, node) =>
      void remove({ environmentId: project.project.environmentId, input: { id: node.module.id } }),
    onOpen: (project, node) => setOpen({ project, moduleId: node.module.id }),
    onNewThread: (project, node) => void startThreadInModule(project, node),
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border">
        <h1 className="truncate text-sm font-medium">
          <T>Work</T>
        </h1>
        <ToggleGroup
          aria-label={gt("View")}
          value={[view]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "tree" || value === "kanban") changeView(value);
          }}
        >
          <ToggleGroupItem value="tree">
            <T>Tree</T>
          </ToggleGroupItem>
          <ToggleGroupItem value="kanban">
            <T>Kanban</T>
          </ToggleGroupItem>
        </ToggleGroup>
        {writableProjects.length === 0 ? null : (
          <div className="ms-auto">
            <Button size="xs" variant="outline" onClick={() => setCreating(true)}>
              <PlusIcon />
              <T>Module</T>
            </Button>
          </div>
        )}
      </WorkspacePageHeader>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <div className="w-56">
          <Select
            value={filteredProject === undefined ? ALL_PROJECTS : projectFilter}
            onValueChange={(value) => {
              if (typeof value === "string") setProjectFilter(value);
            }}
          >
            <SelectTrigger size="sm" aria-label={gt("Project")}>
              <SelectValue>{filteredProject?.project.title ?? gt("All projects")}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value={ALL_PROJECTS}>
                <T>All projects</T>
              </SelectItem>
              {board.projects.map((project) => (
                <SelectItem key={boardProjectKey(project)} value={boardProjectKey(project)}>
                  {project.project.title}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
        <Toggle
          variant="outline"
          size="sm"
          pressed={dueThisMonth}
          onPressedChange={setDueThisMonth}
        >
          {dueThisMonth ? <CheckIcon /> : null}
          <T>Due this month</T>
        </Toggle>
        <Toggle variant="outline" size="sm" pressed={hideDone} onPressedChange={setHideDone}>
          {hideDone ? <CheckIcon /> : null}
          <T>Hide done</T>
        </Toggle>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {view === "tree" ? (
          <WorkTree
            projects={shownProjects}
            filters={filters}
            loading={board.loading}
            {...handlers}
          />
        ) : (
          <WorkKanban projects={shownProjects} filters={filters} {...handlers} />
        )}
      </div>
      {open === null || openProject === undefined ? null : (
        <WorkModulePanel
          project={openProject}
          moduleId={open.moduleId}
          today={today}
          onClose={() => setOpen(null)}
          onUpdate={update}
          onNewThread={handlers.onNewThread}
        />
      )}
      {creating ? (
        <CreateModuleDialog
          projects={writableProjects}
          preferredKey={filteredProject === undefined ? null : projectFilter}
          onCreate={(project, title) => void createAndOpen(project, title)}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </SidebarInset>
  );
}
