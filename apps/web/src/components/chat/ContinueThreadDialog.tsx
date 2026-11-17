import { useAtomValue } from "@effect/atom-react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  buildContinuationMessages,
  resolveContinuationWorkspace,
} from "@t3tools/client-runtime/state/threadContinuation";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type OrchestrationV2ThreadProjection,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useLogicalProjectEnvironments } from "~/hooks/useLogicalProjectEnvironments";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { newThreadId } from "~/lib/utils";
import { useProjects } from "~/state/entities";
import { useConnectedEnvironmentIds } from "~/state/environments";
import { useEnvironmentsWithScope } from "~/state/session";
import { cachedThreadReader, threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { vcsEnvironment } from "~/state/vcs";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Radio, RadioGroup } from "../ui/radio-group";
import { toastManager } from "../ui/toast";
import { continuationKey, continuationOfAtom } from "./continuationLinks";
import { continueThreadDialogThreadAtom } from "./continueThreadDialogState";

export function ContinueThreadDialogHost() {
  const threadRef = useAtomValue(continueThreadDialogThreadAtom);
  if (threadRef === null) return null;
  return <OpenExistingOrContinue key={scopedThreadKey(threadRef)} threadRef={threadRef} />;
}

/** A thread continues once; asking again opens the continuation instead of making a second one. */
function OpenExistingOrContinue({ threadRef }: { readonly threadRef: ScopedThreadRef }) {
  const continuation = useAtomValue(continuationOfAtom(continuationKey(threadRef)));
  if (continuation !== null) {
    return (
      <OpenContinuedThread target={scopeThreadRef(continuation.environmentId, continuation.id)} />
    );
  }
  return (
    <ContinueThreadDialog
      key={scopedThreadKey(threadRef)}
      threadRef={threadRef}
      onClose={() => appAtomRegistry.set(continueThreadDialogThreadAtom, null)}
    />
  );
}

function OpenContinuedThread({ target }: { readonly target: ScopedThreadRef }) {
  const navigate = useNavigate();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- navigates once when the dialog request resolves to an existing continuation
  useEffect(() => {
    appAtomRegistry.set(continueThreadDialogThreadAtom, null);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the navigate handle changes each render
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(target) });
  }, [target.environmentId, target.threadId]);
  return null;
}

type CopyState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "ready"; readonly projection: OrchestrationV2ThreadProjection };

type RunState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "failed"; readonly message: string };

function ContinueThreadDialog({
  threadRef,
  onClose,
}: {
  readonly threadRef: ScopedThreadRef;
  readonly onClose: () => void;
}) {
  const navigate = useNavigate();
  const readCachedThread = useAtomCommand(cachedThreadReader, { reportFailure: false });
  const readRefs = useAtomCommand(vcsEnvironment.readRefs, { reportFailure: false });
  const createWorktree = useAtomCommand(vcsEnvironment.createWorktree, { reportFailure: false });
  const continueThread = useAtomCommand(threadEnvironment.continueFromOfflineCopy, {
    reportFailure: false,
  });
  const [copy, setCopy] = useState<CopyState>({ status: "loading" });
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [chosen, setChosen] = useState<EnvironmentId | null>(null);
  // Reused across attempts so a retry after a lost response lands on the same thread.
  const [threadId] = useState(newThreadId);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the offline cache once on open
  useEffect(() => {
    let cancelled = false;
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the command handle changes each render
    void readCachedThread(threadRef).then((result) => {
      if (cancelled) return;
      setCopy(
        result._tag === "Success" && result.value !== null
          ? { status: "ready", projection: result.value }
          : { status: "missing" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [threadRef.environmentId, threadRef.threadId]);

  const projects = useProjects();
  const sourceProject =
    copy.status === "ready"
      ? (projects.find(
          (project) =>
            project.environmentId === threadRef.environmentId &&
            project.id === copy.projection.thread.projectId,
        ) ?? null)
      : null;
  const machines = useLogicalProjectEnvironments(sourceProject, false);
  const connected = useConnectedEnvironmentIds();
  const operable = useEnvironmentsWithScope(machines, AuthOrchestrationOperateScope);
  const candidates = machines.filter(
    (machine) =>
      machine.environmentId !== threadRef.environmentId &&
      machine.projectId !== null &&
      connected.includes(machine.environmentId) &&
      operable.has(machine.environmentId),
  );
  const destination =
    candidates.find((machine) => machine.environmentId === chosen) ??
    (candidates.length === 1 ? candidates[0]! : null);
  const sourceLabel =
    machines.find((machine) => machine.environmentId === threadRef.environmentId)?.label ??
    "the original machine";

  const submit = async () => {
    if (copy.status !== "ready" || destination === null || destination.projectId === null) return;
    const thread = copy.projection.thread;
    const destinationRoot =
      projects.find(
        (project) =>
          project.environmentId === destination.environmentId &&
          project.id === destination.projectId,
      )?.workspaceRoot ?? null;
    setRun({ status: "running" });
    const fail = (message: string) => setRun({ status: "failed", message });
    let branch: string | null = null;
    let worktreePath: string | null = null;
    let missingBranch: string | null = destinationRoot === null ? thread.branch : null;
    if (thread.branch !== null && destinationRoot !== null) {
      const refs = await readRefs({
        environmentId: destination.environmentId,
        input: {
          cwd: destinationRoot,
          query: thread.branch,
          includeMatchingRemoteRefs: true,
          limit: 20,
        },
      });
      if (refs._tag !== "Success") {
        fail("Could not check the branch on the other machine.");
        return;
      }
      const workspace = resolveContinuationWorkspace(thread.branch, refs.value.refs);
      if (workspace.kind === "existing") {
        branch = workspace.branch;
        worktreePath = workspace.worktreePath;
      } else if (workspace.kind === "missing") {
        missingBranch = workspace.branch;
      } else if (workspace.kind === "create") {
        const created = await createWorktree({
          environmentId: destination.environmentId,
          input: { cwd: destinationRoot, refName: workspace.branch, path: null },
        });
        if (created._tag !== "Success") {
          const error = squashAtomCommandFailure(created);
          fail(error instanceof Error ? error.message : "Could not create the worktree.");
          return;
        }
        branch = created.value.worktree.refName;
        worktreePath = created.value.worktree.path;
      }
    }
    const result = await continueThread({
      environmentId: destination.environmentId,
      input: {
        threadId,
        projectId: destination.projectId,
        source: { environmentId: threadRef.environmentId, threadId: threadRef.threadId },
        title: thread.title,
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        branch,
        worktreePath,
        messages: buildContinuationMessages(copy.projection),
      },
    });
    if (result._tag !== "Success") {
      const error = squashAtomCommandFailure(result);
      fail(error instanceof Error ? error.message : "Could not continue the thread.");
      return;
    }
    onClose();
    if (missingBranch !== null) {
      toastManager.add({
        type: "warning",
        title: `Branch ${missingBranch} does not exist on this machine`,
        description: "Code that was not pushed stayed on the original machine.",
      });
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(scopeThreadRef(destination.environmentId, threadId)),
    });
  };

  const threadBranch = copy.status === "ready" ? copy.projection.thread.branch : null;
  const disabledReason =
    copy.status === "missing"
      ? "No local copy of this thread"
      : copy.status === "ready" && candidates.length === 0
        ? "No connected machine has this project"
        : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && run.status !== "running") onClose();
      }}
    >
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Continue on another machine</DialogTitle>
          <DialogDescription>
            {sourceLabel} is offline. This starts a new thread from the conversation saved on this
            device. The original stays where it is and is archived when {sourceLabel} is back.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {disabledReason !== null ? (
            <p className="text-muted-foreground text-sm">{disabledReason}</p>
          ) : copy.status === "loading" ? (
            <p className="text-muted-foreground text-sm">Reading the saved copy...</p>
          ) : (
            <RadioGroup
              aria-label="Machine"
              value={destination?.environmentId ?? ""}
              onValueChange={(value) => setChosen(value as EnvironmentId)}
            >
              {candidates.map((machine) => (
                <label key={machine.environmentId} className="flex items-center gap-2 text-sm">
                  <Radio value={machine.environmentId} />
                  {machine.label}
                </label>
              ))}
            </RadioGroup>
          )}
          {threadBranch !== null && copy.status === "ready" ? (
            <p className="mt-3 text-muted-foreground text-xs">
              The thread worked on branch {threadBranch}. If it is missing on the other machine, the
              thread starts in the project folder.
            </p>
          ) : null}
          {run.status === "failed" ? (
            <p role="alert" className="mt-3 text-destructive text-xs">
              {run.message}
            </p>
          ) : null}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={run.status === "running"}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={destination === null || run.status === "running"}
          >
            {run.status === "running" ? "Continuing..." : "Continue"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
