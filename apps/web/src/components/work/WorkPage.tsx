import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { WorkModuleNode } from "@t3tools/client-runtime/workModuleTree";
import type { WorkModuleId, WorkModuleUpsertInput } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
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

const moduleThreadPrompt = (path: string[], note: string) =>
  [`Módulo: ${path.join(" › ")}`, note.trim() === "" ? null : `Nota: ${note.trim()}`]
    .filter((line) => line !== null)
    .join("\n") + "\n\n";

const boardProjectKey = (project: WorkBoardProject) =>
  `${project.project.environmentId}:${project.project.id}`;

function CreateModuleDialog(props: {
  projects: WorkBoardProject[];
  onCreate: (project: WorkBoardProject, title: string) => void;
  onClose: () => void;
}) {
  const [selectedKey, setSelectedKey] = useState(() =>
    props.projects[0] === undefined ? "" : boardProjectKey(props.projects[0]),
  );
  const selected = props.projects.find((project) => boardProjectKey(project) === selectedKey);
  return (
    <WorkTitleDialog
      title="Novo módulo"
      submitLabel="Criar"
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
        <SelectTrigger aria-label="Projeto">
          <SelectValue>{selected?.project.title ?? "Escolha um projeto"}</SelectValue>
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
        <h1 className="truncate text-sm font-medium">Trabalho</h1>
        <ToggleGroup
          aria-label="Visão"
          value={[view]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "tree" || value === "kanban") changeView(value);
          }}
        >
          <ToggleGroupItem value="tree">Árvore</ToggleGroupItem>
          <ToggleGroupItem value="kanban">Kanban</ToggleGroupItem>
        </ToggleGroup>
        {writableProjects.length === 0 ? null : (
          <div className="ms-auto">
            <Button size="xs" variant="outline" onClick={() => setCreating(true)}>
              <PlusIcon />
              Módulo
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
            <SelectTrigger size="sm" aria-label="Projeto">
              <SelectValue>{filteredProject?.project.title ?? "Todos os projetos"}</SelectValue>
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value={ALL_PROJECTS}>Todos os projetos</SelectItem>
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
          Vence este mês
        </Toggle>
        <Toggle variant="outline" size="sm" pressed={hideDone} onPressedChange={setHideDone}>
          Ocultar finalizados
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
          onCreate={(project, title) => create(project, null, title)}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </SidebarInset>
  );
}
