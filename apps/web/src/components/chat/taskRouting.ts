import type { DraftSessionState } from "../../composerDraftStore";

/** A draft the user has not steered to a machine, branch or worktree, so the classifier may place it. */
export function isAutoRoutedDraft(
  draft: Pick<DraftSessionState, "environmentSelection" | "branch" | "worktreePath">,
): boolean {
  return (
    draft.environmentSelection !== "manual" &&
    draft.environmentSelection !== "claude-cloud" &&
    (!draft.branch || draft.environmentSelection === "auto") &&
    !draft.worktreePath
  );
}

/** The branch a fresh worktree will start from; null when the task runs in an existing checkout. */
export function draftWorktreeBaseBranch(
  draft: Pick<DraftSessionState, "envMode" | "worktreePath" | "branch">,
) {
  return draft.envMode === "worktree" && !draft.worktreePath ? draft.branch : null;
}
