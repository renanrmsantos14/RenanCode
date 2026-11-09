import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { isOverdue, type WorkModuleNode } from "@t3tools/client-runtime/workModuleTree";
import type { ThreadId, WorkModuleId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { AsyncResult } from "effect/reactivity";
import { CheckIcon, LinkIcon, PlusIcon, SparklesIcon, UnlinkIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

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
import { Sheet, SheetHeader, SheetPopup, SheetTitle } from "~/components/ui/sheet";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { useThreadShellsForProjectRefs } from "~/state/entities";
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

const INLINE_FIELD_CLASS =
  "-mx-2 w-[calc(100%+(--spacing(4)))] rounded-md bg-transparent px-2 py-1 outline-none transition-colors duration-150 placeholder:text-muted-foreground/70 enabled:hover:bg-accent/50 focus:bg-accent/50 focus:ring-1 focus:ring-ring disabled:cursor-default";

const THREAD_STATUS_DOT: Record<SidebarThreadStatus, string> = {
  approval: "bg-warning",
  input: "bg-yellow-500",
  request: "bg-guest",
  preparing: "bg-info",
  working: "bg-info",
  waiting: "bg-muted-foreground/40",
  failed: "bg-destructive",
  limited: "bg-warning",
  ready: "bg-success",
};

function ThreadRow(props: {
  thread: EnvironmentThreadShell | undefined;
  onOpen: () => void;
  children?: ReactNode;
}) {
  const status = props.thread === undefined ? null : resolveSidebarThreadStatus(props.thread);
  return (
    <li className="group/row flex items-center gap-1 rounded-md pe-1 transition-[background-color,opacity,translate] duration-200 ease-out-quint hover:bg-accent/50 starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none">
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={props.onOpen}
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            status === null ? "bg-muted-foreground/25" : THREAD_STATUS_DOT[status],
          )}
        />
        {props.thread === undefined ? (
          <span className="truncate text-muted-foreground italic">Thread indisponível</span>
        ) : (
          <span className="truncate">{props.thread.title}</span>
        )}
        {status === null ? null : (
          <span className="ms-auto shrink-0 text-xs text-muted-foreground">
            {THREAD_STATUS_LABEL[status]}
          </span>
        )}
      </button>
      {props.children}
    </li>
  );
}

function RowAction(props: {
  label: string;
  reveal?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <span
      className={
        props.reveal
          ? "flex opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 has-focus-visible:opacity-100 pointer-coarse:opacity-100"
          : "flex"
      }
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={props.label}
              onClick={props.onClick}
            />
          }
        >
          {props.children}
        </TooltipTrigger>
        <TooltipPopup>{props.label}</TooltipPopup>
      </Tooltip>
    </span>
  );
}

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
          <Combobox<EnvironmentThreadShell>
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
  // The family keys on the refs' string form, so a fresh array each render reuses the atom.
  const threads = useThreadShellsForProjectRefs([
    scopeProjectRef(environmentId, project.project.id),
  ]);
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

  const suggested = links.filter((link) => link.suggested);
  const confirmed = links.filter((link) => !link.suggested);
  const openThread = (threadId: ThreadId) =>
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(environmentId, threadId)),
    });

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <SheetPopup side="right">
        <SheetHeader>
          <SheetTitle className="sr-only">{workModule.title}</SheetTitle>
          <div className="flex min-w-0 flex-col gap-1 pe-6">
            {node.ancestorTitles.length === 0 ? null : (
              <p className="truncate text-xs text-muted-foreground">
                {node.ancestorTitles.join(" › ")}
              </p>
            )}
            <input
              key={workModule.title}
              aria-label="Título"
              defaultValue={workModule.title}
              maxLength={200}
              disabled={!canWrite}
              className={cn(INLINE_FIELD_CLASS, "text-xl font-semibold leading-snug")}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
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
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
          <textarea
            key={workModule.note}
            aria-label="Nota"
            placeholder={canWrite ? "Adicionar nota…" : "Sem nota"}
            defaultValue={workModule.note}
            maxLength={20_000}
            disabled={!canWrite}
            className={cn(
              INLINE_FIELD_CLASS,
              "field-sizing-content min-h-16 resize-none text-sm leading-relaxed text-foreground/90",
            )}
            onBlur={(event) => {
              if (event.target.value !== workModule.note) update({ note: event.target.value });
            }}
          />
          <dl className="grid grid-cols-[5.5rem_1fr] items-center gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="flex h-8 items-center">
              <WorkStatusMenu
                status={workModule.status}
                waitingReason={workModule.waitingReason}
                disabled={!canWrite}
                onChange={(next) => update(next)}
              />
            </dd>
            {workModule.waitingReason === null ? null : (
              <>
                <dt className="text-muted-foreground">Motivo</dt>
                <dd className="py-1.5">{workModule.waitingReason}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Prazo</dt>
            <dd className="-ms-2.5 flex h-8 items-center">
              <WorkDueDatePicker
                value={workModule.dueDate}
                overdue={isOverdue(workModule, props.today)}
                disabled={!canWrite}
                onChange={(dueDate) => update({ dueDate })}
              />
            </dd>
          </dl>
          <section className="flex flex-col gap-2 border-t pt-5">
            <header className="flex items-center gap-2">
              <h3 className="text-sm font-medium">Threads</h3>
              {confirmed.length === 0 ? null : (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {confirmed.length}
                </span>
              )}
              {canWrite ? (
                <div className="ms-auto flex items-center gap-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => props.onNewThread(project, node)}
                  >
                    <PlusIcon />
                    Nova
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setLinking(true)}>
                    <LinkIcon />
                    Ligar
                  </Button>
                </div>
              ) : null}
            </header>
            {confirmed.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nenhuma thread ligada.</p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {confirmed.map((link) => (
                  <ThreadRow
                    key={link.threadId}
                    thread={shellById.get(link.threadId)}
                    onOpen={() => openThread(link.threadId)}
                  >
                    {canWrite ? (
                      <RowAction
                        label="Desvincular"
                        reveal
                        onClick={() => void unlinkThread(threadInput(link.threadId))}
                      >
                        <UnlinkIcon />
                      </RowAction>
                    ) : null}
                  </ThreadRow>
                ))}
              </ul>
            )}
            {suggested.length === 0 ? null : (
              <div className="mt-2 flex flex-col gap-1">
                <h4 className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <SparklesIcon className="size-3.5" />
                  Sugeridas
                </h4>
                <ul className="-mx-2 flex flex-col">
                  {suggested.map((link) => (
                    <ThreadRow
                      key={link.threadId}
                      thread={shellById.get(link.threadId)}
                      onOpen={() => openThread(link.threadId)}
                    >
                      {canWrite ? (
                        <>
                          <RowAction
                            label="Confirmar"
                            onClick={() => void confirmSuggestion(threadInput(link.threadId))}
                          >
                            <CheckIcon />
                          </RowAction>
                          <RowAction
                            label="Descartar"
                            onClick={() => void unlinkThread(threadInput(link.threadId))}
                          >
                            <XIcon />
                          </RowAction>
                        </>
                      ) : null}
                    </ThreadRow>
                  ))}
                </ul>
              </div>
            )}
          </section>
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
