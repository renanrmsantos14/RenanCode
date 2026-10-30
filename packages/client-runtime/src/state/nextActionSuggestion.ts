import type { OrchestrationV2RunStatus } from "@t3tools/contracts";

/** What a composer last saw of a thread's latest run. */
export interface NextActionRunObservation {
  readonly threadKey: string;
  readonly runId: string | null;
  readonly status: OrchestrationV2RunStatus | null;
}

/**
 * A suggestion is requested only when this client watched the latest run finish, so opening
 * or switching to an already finished thread costs nothing.
 */
export function shouldRequestNextAction(
  previous: NextActionRunObservation | null,
  current: NextActionRunObservation,
): boolean {
  return (
    previous !== null &&
    previous.threadKey === current.threadKey &&
    current.runId !== null &&
    current.status === "completed" &&
    (previous.runId !== current.runId || previous.status !== "completed")
  );
}

/** A suggestion is stale once the thread moved on or the user started typing. */
export function isNextActionSuggestionCurrent(
  requestedFor: NextActionRunObservation,
  current: NextActionRunObservation,
  prompt: string,
): boolean {
  return (
    requestedFor.threadKey === current.threadKey &&
    requestedFor.runId === current.runId &&
    current.status === "completed" &&
    prompt.length === 0
  );
}
