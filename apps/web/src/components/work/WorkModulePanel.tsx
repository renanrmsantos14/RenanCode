import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isOverdue, type WorkModuleNode } from "@t3tools/client-runtime/workModuleTree";
import type { ThreadId, WorkModuleId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from "~/components/ui/combobox";
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Sheet, SheetHeader, SheetPopup, SheetTitle } from "~/components/ui/sheet";
import { Textarea } from "~/components/ui/textarea";
import { useThreadShells } from "~/state/entities";
import { useAtomCommand } from "~/state/use-atom-command";
import { workModuleEnvironment } from "~/state/workModules";
import { buildThreadRouteParams } from "~/threadRoutes";

import { resolveSidebarThreadStatus, type SidebarThreadStatus } from "../Sidebar.logic";
import type { WorkBoardHandlers, WorkBoardProject } from "./useWorkBoard";
import { WorkDueDatePicker } from "./WorkDueDatePicker";
import { WorkStatusMenu } from "./WorkStatusMenu";

const THREAD_STATUS_LABEL: Record<SidebarThreadStatus, string> = {
  approval: "Aprovação",
  input: "Resposta",
  request: "Pedido",
  preparing: "Preparando",
  working: "Trabalhando",
  waiting: "Aguardando",
  failed: "Falhou",
  limited: "Limite",
  ready: "Pronta",
};

const findNode = (nodes: WorkModuleNode[], id: WorkModuleId): WorkModuleNode | null => {
  for (const node of nodes) {
    if (node.module.id === id) return node;
    const found = findNode(node.children, id);
    if (found !== null) return found;
  }
  return null;
};

function LinkThreadDialog(props: {
  threads: EnvironmentThreadShell[];
  onLink: (threadId: ThreadId) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Ligar thread existente</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <Combobox
            items={props.threads}
            itemToStringLabel={(thread) => thread.title}
            onValueChange={(thread) => {
              if (thread === null) return;
              props.onClose();
              props.onLink(thread.id);
            }}
          >
            <ComboboxInput aria-label="Thread" placeholder="Buscar thread…" autoFocus />
            <ComboboxPopup>
              <ComboboxEmpty>Nenhuma thread encontrada.</ComboboxEmpty>
              <ComboboxList>
                {(thread: EnvironmentThreadShell) => (
                  <ComboboxItem key={thread.id} value={thread}>
                    {thread.title}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxPopup>
          </Combobox>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

export function WorkModulePanel(props: {
  project: WorkBoardProject;
  moduleId: WorkModuleId;
  today: string;
  onClose: () => void;
  onUpdate: WorkBoardHandlers["onUpdate"];
  onNewThread: WorkBoardHandlers["onNewThread"];
}) {
  const { project } = props;
  const environmentId = project.project.environmentId;
  const snapshot = AsyncResult.getOrElse(
    useAtomValue(workModuleEnvironment.live({ environmentId, input: {} })),
    () => null,
  );
  const threads = useThreadShells();
  const navigate = useNavigate();
  const linkThread = useAtomCommand(workModuleEnvironment.linkThread, {
    label: "work module link",
  });
  const unlinkThread = useAtomCommand(workModuleEnvironment.unlinkThread, {
    label: "work module unlink",
  });
  const confirmSuggestion = useAtomCommand(workModuleEnvironment.confirmSuggestion, {
    label: "work module confirm",
  });
  const [linking, setLinking] = useState(false);

  const node = findNode(project.nodes, props.moduleId);
  if (node === null) return null;
  const workModule = node.module;
  const canWrite = project.canWrite;
  const links = (snapshot?.links ?? []).filter((link) => link.moduleId === workModule.id);
  const shellById = new Map(
    threads
      .filter((thread) => thread.environmentId === environmentId)
      .map((thread) => [thread.id, thread] as const),
  );
  const linkedIds = new Set(links.map((link) => link.threadId));
  const linkCandidates = [...shellById.values()].filter(
    (thread) => thread.projectId === project.project.id && !linkedIds.has(thread.id),
  );
  const update = (input: Parameters<WorkBoardHandlers["onUpdate"]>[1]) =>
    props.onUpdate(project, { ...input, id: workModule.id });
  const threadInput = (threadId: ThreadId) => ({ environmentId, input: { threadId } });

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <SheetPopup side="right">
        <SheetHeader>
          <SheetTitle>{[...node.ancestorTitles, workModule.title].join(" › ")}</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="work-module-title">Título</Label>
            <Input
              key={workModule.title}
              id="work-module-title"
              defaultValue={workModule.title}
              maxLength={200}
              disabled={!canWrite}
              onBlur={(event) => {
                const title = event.target.value.trim();
                if (title === "" || title === workModule.title) {
                  event.target.value = workModule.title;
                  return;
                }
                update({ title });
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="work-module-note">Nota</Label>
            <Textarea
              key={workModule.note}
              id="work-module-note"
              defaultValue={workModule.note}
              maxLength={20_000}
              disabled={!canWrite}
              onBlur={(event) => {
                if (event.target.value !== workModule.note) update({ note: event.target.value });
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <WorkStatusMenu
              status={workModule.status}
              waitingReason={workModule.waitingReason}
              disabled={!canWrite}
              onChange={(next) => update(next)}
            />
            <WorkDueDatePicker
              value={workModule.dueDate}
              overdue={isOverdue(workModule, props.today)}
              disabled={!canWrite}
              onChange={(dueDate) => update({ dueDate })}
            />
          </div>
          {workModule.waitingReason === null ? null : (
            <p className="text-sm text-muted-foreground">Motivo: {workModule.waitingReason}</p>
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Threads</h3>
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma thread ligada.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {links.map((link) => {
                  const thread = shellById.get(link.threadId);
                  return (
                    <li key={link.threadId} className="flex items-center gap-2">
                      <Button
                        variant="link"
                        size="sm"
                        className="min-w-0 flex-1 justify-start"
                        onClick={() =>
                          void navigate({
                            to: "/$environmentId/$threadId",
                            params: buildThreadRouteParams(
                              scopeThreadRef(environmentId, link.threadId),
                            ),
                          })
                        }
                      >
                        <span className="truncate">{thread?.title ?? "Thread não carregada"}</span>
                      </Button>
                      {thread === undefined ? null : (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {THREAD_STATUS_LABEL[resolveSidebarThreadStatus(thread)]}
                        </span>
                      )}
                      {!canWrite ? null : link.suggested ? (
                        <>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => void confirmSuggestion(threadInput(link.threadId))}
                          >
                            Confirmar
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => void unlinkThread(threadInput(link.threadId))}
                          >
                            Descartar
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void unlinkThread(threadInput(link.threadId))}
                        >
                          Desvincular
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => props.onNewThread(project, node)}
                >
                  <PlusIcon />
                  Nova thread
                </Button>
                <Button size="xs" variant="outline" onClick={() => setLinking(true)}>
                  Ligar thread existente…
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {/* Inside the popup so the sheet treats the dialog as nested and stays open. */}
        {linking ? (
          <LinkThreadDialog
            threads={linkCandidates}
            onLink={(threadId) =>
              void linkThread({ environmentId, input: { threadId, moduleId: workModule.id } })
            }
            onClose={() => setLinking(false)}
          />
        ) : null}
      </SheetPopup>
    </Sheet>
  );
}
