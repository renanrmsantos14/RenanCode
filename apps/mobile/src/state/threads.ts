import { dedupeClaudeCloudThreads } from "@t3tools/client-runtime/state/claudeCloud";
import { createChildThreadApprovalsAtom } from "@t3tools/client-runtime/state/thread-requests";
import { useAtomValue } from "@effect/atom-react";
import {
  createEnvironmentThreadDetailAtoms,
  createEnvironmentThreadShellAtoms,
  createEnvironmentThreadStateAtoms,
  EMPTY_ENVIRONMENT_THREAD_STATE,
  type EnvironmentThreadState,
  createOlderSettledThreadAtoms,
  createThreadEnvironmentAtoms,
  createThreadFamilyAtoms,
} from "@t3tools/client-runtime/state/threads";
import { createSteadyShellAtoms } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";

import { environmentCatalog } from "../connection/catalog";
import { connectionAtomRuntime } from "../connection/runtime";
import { scopedThreadKey } from "../lib/scopedEntities";
import { appAtomRegistry } from "./atom-registry";
import {
  pendingThreadCreationOutcomesAtom,
  selectThreadCreationDetail,
} from "./pending-thread-creation";
import { connectedEnvironmentIdsAtom } from "./presentation";
import { serverEnvironment } from "./server";
import { environmentShell } from "./shell";
import { environmentPresentations } from "./presentation";
import { threadOutboxManager } from "./thread-outbox";

export const threadFamilies = createThreadFamilyAtoms(
  connectionAtomRuntime,
  environmentShell.stateAtom,
);
export const olderSettledThreads = createOlderSettledThreadAtoms(
  connectionAtomRuntime,
  environmentShell.stateAtom,
);
export const environmentThreads = createEnvironmentThreadStateAtoms(connectionAtomRuntime);
export const threadEnvironment = createThreadEnvironmentAtoms(
  connectionAtomRuntime,
  threadFamilies.snapshotAtom,
  environmentShell.statusAtom,
  environmentThreads.stateAtom,
);
export const environmentThreadDetails = createEnvironmentThreadDetailAtoms(
  threadEnvironment.threadStateAtom,
);
export const environmentThreadShells = createEnvironmentThreadShellAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  connectionPhaseAtom: environmentPresentations.connectionPhaseAtom,
  snapshotAtom: threadEnvironment.snapshotAtom,
  hiddenThreadTagsAtom: serverEnvironment.hiddenThreadTagsAtom,
});
const steadyShells = createSteadyShellAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  snapshotAtom: threadEnvironment.snapshotAtom,
  shellStateAtom: environmentShell.stateValueAtom,
  rowActionsAtom: threadEnvironment.rowActionsAtom,
  connectionStateAtom: environmentCatalog.stateAtom,
});
/**
 * The threads that lists arrange. Rows wait while their environment synchronizes, so a list
 * changes once when environments connect, not once per environment.
 */
export const steadyShellsHoldingAtom = steadyShells.holdingAtom;
const steadyNavigationThreadShellsPerEnvironmentAtom = createEnvironmentThreadShellAtoms({
  catalogValueAtom: environmentCatalog.catalogValueAtom,
  connectionPhaseAtom: environmentPresentations.connectionPhaseAtom,
  snapshotAtom: steadyShells.snapshotAtom,
  hiddenThreadTagsAtom: serverEnvironment.hiddenThreadTagsAtom,
}).navigationThreadShellsAtom;
// A copy on a disconnected environment cannot be sent to, so a connected one wins a tie.
export const steadyNavigationThreadShellsAtom = Atom.make((get) =>
  dedupeClaudeCloudThreads(
    get(steadyNavigationThreadShellsPerEnvironmentAtom),
    new Set(get(connectedEnvironmentIdsAtom)),
  ),
).pipe(Atom.withLabel("steady-navigation-thread-shells-deduped"));
/** Which environment's copy of a cloud session is listed; streaming ticks leave it unchanged. */
export const listedCloudSessionEnvironmentAtom = Atom.family((threadId: ThreadId | null) =>
  Atom.make((get) =>
    threadId === null
      ? null
      : (get(steadyNavigationThreadShellsAtom).find((thread) => thread.id === threadId)
          ?.environmentId ?? null),
  ),
);
export const childThreadApprovalsAtom = createChildThreadApprovalsAtom({
  childThreadInputsAtom: environmentThreadShells.childThreadInputsAtom,
  pendingRequestsAtom: environmentThreadDetails.pendingRequestsAtom,
});

// Long enough for the opened screen to subscribe; its subscription keeps the thread after this.
const OPENING_THREAD_HOLD_MS = 3_000;

/**
 * Starts loading a thread being opened before its screen renders and subscribes, which
 * otherwise waits for navigation to commit.
 */
export function startOpeningEnvironmentThread(
  environmentId: EnvironmentId,
  threadId: ThreadId,
  holdMs = OPENING_THREAD_HOLD_MS,
) {
  // A thread whose creation is still queued would load as not found and stay deleted;
  // the opened screen loads it once creation is delivered.
  const { detailRef } = selectThreadCreationDetail({
    threadRef: { environmentId, threadId },
    threadKey: scopedThreadKey(environmentId, threadId),
    queuedMessagesByThreadKey: appAtomRegistry.get(
      threadOutboxManager.queuedMessagesByThreadKeyAtom,
    ),
    outcomes: appAtomRegistry.get(pendingThreadCreationOutcomesAtom),
  });
  if (detailRef === null) return;
  const release = appAtomRegistry.mount(environmentThreads.stateAtom(environmentId, threadId));
  setTimeout(release, holdMs);
}

// Covers a quick look at another thread or Home: coming back finds the subscription still live.
const LEFT_THREAD_HOLD_MS = 30_000;

/** Keeps a thread whose screen just closed loaded for a while, so reopening it is instant. */
export function holdLeftEnvironmentThread(environmentId: EnvironmentId, threadId: ThreadId) {
  startOpeningEnvironmentThread(environmentId, threadId, LEFT_THREAD_HOLD_MS);
}

const EMPTY_THREAD_STATE_ATOM = Atom.make(AsyncResult.success(EMPTY_ENVIRONMENT_THREAD_STATE)).pipe(
  Atom.withLabel("mobile-environment-thread:empty"),
);

export function useEnvironmentThread(
  environmentId: EnvironmentId | null,
  threadId: ThreadId | null,
): EnvironmentThreadState {
  const result = useAtomValue(
    environmentId !== null && threadId !== null
      ? environmentThreads.stateAtom(environmentId, threadId)
      : EMPTY_THREAD_STATE_ATOM,
  );
  const state = AsyncResult.getOrElse(
    result,
    () => EMPTY_ENVIRONMENT_THREAD_STATE,
  ) as EnvironmentThreadState;
  return state;
}
