import {
  dismissNextAction,
  isNextActionDismissed,
  nextActionDismissalKey,
  type NextActionDisplay,
  resolveNextActionDisplay,
  subscribeNextActionDismissals,
} from "@t3tools/client-runtime/state/next-action-suggestion";
import { deriveLatestThreadRun } from "@t3tools/client-runtime/state/thread-execution";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { useQuietThreadProjection } from "~/state/entities";

/**
 * The server-generated suggestion for the thread's latest completed run, as composer ghost text.
 * Only the thread detail carries it; the shell's latest run does not.
 */
export function useNextActionSuggestion(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly promptEmpty: boolean;
}): { readonly display: NextActionDisplay | null; readonly dismiss: () => void } {
  const { threadRef, promptEmpty } = input;
  const structure = useQuietThreadProjection(threadRef);
  const run = structure === null ? null : deriveLatestThreadRun(structure.projection);
  const dismissalKey =
    threadRef === null || run === null
      ? null
      : nextActionDismissalKey(`${threadRef.environmentId}:${threadRef.threadId}`, run.runId);
  const dismissed = useSyncExternalStore(
    subscribeNextActionDismissals,
    () => dismissalKey !== null && isNextActionDismissed(dismissalKey),
    () => false,
  );
  const dismiss = () => {
    if (dismissalKey !== null) dismissNextAction(dismissalKey);
  };
  return { display: resolveNextActionDisplay({ run, dismissed, promptEmpty }), dismiss };
}
