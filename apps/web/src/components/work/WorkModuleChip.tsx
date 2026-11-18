import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { buildWorkModuleForest, type WorkModuleNode } from "@t3tools/client-runtime/workModuleTree";
import type { EnvironmentId, ProjectId, ThreadId, WorkModuleId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { T, useGT } from "gt-react";
import { useState } from "react";

import { useComposerDraftStore } from "~/composerDraftStore";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { useAtomCommand } from "~/state/use-atom-command";
import { workModuleEnvironment } from "~/state/workModules";

const flatten = (nodes: WorkModuleNode[]): WorkModuleNode[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children)]);

const modulePath = (node: WorkModuleNode) => [...node.ancestorTitles, node.module.title];

export function WorkModuleChip(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projectId: ProjectId;
  draftModuleId: WorkModuleId | undefined;
  isServerThread: boolean;
}) {
  const gt = useGT();
  const { environmentId, threadId } = props;
  const snapshot = AsyncResult.getOrElse(
    useAtomValue(workModuleEnvironment.live({ environmentId, input: {} })),
    () => null,
  );
  const canWrite = useAtomValue(workModuleEnvironment.upsert.permissionAtom(environmentId));
  const upsert = useAtomCommand(workModuleEnvironment.upsert, { label: "work module save" });
  const linkThread = useAtomCommand(workModuleEnvironment.linkThread, {
    label: "work module link",
  });
  const unlinkThread = useAtomCommand(workModuleEnvironment.unlinkThread, {
    label: "work module unlink",
  });
  const confirmSuggestion = useAtomCommand(workModuleEnvironment.confirmSuggestion, {
    label: "work module confirm",
  });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Servers without work modules, or still loading, show no chip.
  if (snapshot === null) return null;
  const link = props.isServerThread
    ? snapshot.links.find((candidate) => candidate.threadId === threadId)
    : undefined;
  const currentId = props.isServerThread ? link?.moduleId : props.draftModuleId;
  const nodes = flatten(buildWorkModuleForest(snapshot).get(props.projectId) ?? []);
  const current = nodes.find((node) => node.module.id === currentId);
  const label =
    current === undefined
      ? gt("Module: none")
      : gt("Module: {path}", { path: modulePath(current).slice(-2).join(" › ") });
  const trimmedQuery = query.trim();
  const matches = nodes.filter((node) =>
    modulePath(node).join(" › ").toLowerCase().includes(trimmedQuery.toLowerCase()),
  );

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (moduleId: WorkModuleId | null) => {
    close();
    if (!props.isServerThread) {
      useComposerDraftStore
        .getState()
        .setDraftWorkModule(scopeThreadRef(environmentId, threadId), moduleId);
      return;
    }
    void (moduleId === null
      ? unlinkThread({ environmentId, input: { threadId } })
      : linkThread({ environmentId, input: { threadId, moduleId } }));
  };
  const create = async () => {
    const title = trimmedQuery;
    close();
    const result = await upsert({
      environmentId,
      input: { projectId: props.projectId, parentId: null, title },
    });
    if (result._tag === "Success") choose(result.value.id);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <PopoverTrigger disabled={!canWrite} aria-label={label} render={<button type="button" />}>
        <Badge variant={link?.suggested === true ? "warning" : "outline"} size="sm">
          {label}
        </Badge>
      </PopoverTrigger>
      <PopoverPopup align="start" width="sm" padding="compact" aria-label={gt("Choose module")}>
        <div className="flex flex-col gap-2">
          {link?.suggested === true ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                <T>Suggested by an agent</T>
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  close();
                  void confirmSuggestion({ environmentId, input: { threadId } });
                }}
              >
                <T>Confirm</T>
              </Button>
              <Button size="xs" variant="ghost" onClick={() => choose(null)}>
                <T>Dismiss</T>
              </Button>
            </div>
          ) : null}
          <Input
            size="sm"
            aria-label={gt("Search modules")}
            placeholder={gt("Search modules…")}
            maxLength={200}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches.length === 0 && trimmedQuery !== "") {
                event.preventDefault();
                void create();
              }
            }}
            autoFocus
          />
          <div className="flex max-h-60 flex-col overflow-y-auto">
            {matches.map((node) => (
              <Button
                key={node.module.id}
                size="sm"
                variant={node.module.id === currentId ? "secondary" : "ghost"}
                className="justify-start"
                onClick={() => choose(node.module.id)}
              >
                <span className="truncate">{modulePath(node).join(" › ")}</span>
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="justify-start"
            disabled={trimmedQuery === ""}
            onClick={() => void create()}
          >
            {trimmedQuery === ""
              ? gt("Create module…")
              : gt("Create module “{title}”", { title: trimmedQuery })}
          </Button>
          {currentId === undefined ? null : (
            <Button
              size="sm"
              variant="ghost"
              className="justify-start"
              onClick={() => choose(null)}
            >
              <T>Unlink</T>
            </Button>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
