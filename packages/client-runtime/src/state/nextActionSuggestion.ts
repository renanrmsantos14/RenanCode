import type { ThreadRunSummary } from "./models.ts";

export type NextActionDisplay =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly text: string };

/**
 * What the composer shows for a thread's latest run. Typing only hides the suggestion, so
 * clearing the draft brings it back; a dismissal is final for that run.
 */
export function resolveNextActionDisplay(input: {
  readonly run: Pick<ThreadRunSummary, "status" | "nextActionSuggestion"> | null;
  readonly dismissed: boolean;
  readonly promptEmpty: boolean;
}): NextActionDisplay | null {
  const suggestion = input.run?.nextActionSuggestion;
  if (
    input.run?.status !== "completed" ||
    suggestion === undefined ||
    suggestion.status === "none" ||
    input.dismissed ||
    !input.promptEmpty
  ) {
    return null;
  }
  return suggestion;
}

export const nextActionDismissalKey = (threadKey: string, runId: string): string =>
  `${threadKey}:${runId}`;

const dismissed = new Set<string>();
const listeners = new Set<() => void>();

/** Device-local: Esc on one client does not hide the suggestion on another. */
export function dismissNextAction(key: string): void {
  if (dismissed.has(key)) return;
  dismissed.add(key);
  for (const listener of listeners) listener();
}

export const isNextActionDismissed = (key: string): boolean => dismissed.has(key);

export function subscribeNextActionDismissals(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
