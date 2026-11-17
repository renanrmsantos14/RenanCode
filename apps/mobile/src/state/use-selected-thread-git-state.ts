import { useMemo } from "react";

import { dedupeRemoteBranchesWithLocalMatches } from "@t3tools/shared/git";

import { useBranches } from "./queries";
import { useVcsActionState } from "./use-vcs-action-state";
import { useThreadSelection } from "./use-thread-selection";
import { useSelectedThreadWorktree } from "./use-selected-thread-worktree";

/** The running git action's label, without the branch list a screen header doesn't need. */
export function useSelectedThreadGitOperationLabel() {
  const { selectedThread } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  return useVcsActionState({
    environmentId: selectedThread?.environmentId ?? null,
    cwd: selectedThreadCwd,
  }).currentLabel;
}

export function useSelectedThreadGitState() {
  const { selectedThread } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const gitOperationLabel = useSelectedThreadGitOperationLabel();

  const selectedThreadBranchTarget = {
    environmentId: selectedThread?.environmentId ?? null,
    cwd: selectedThreadCwd,
    query: null,
  };
  const selectedThreadBranchState = useBranches(selectedThreadBranchTarget);
  const selectedThreadBranches = useMemo(
    () =>
      dedupeRemoteBranchesWithLocalMatches(selectedThreadBranchState.data?.refs ?? []).filter(
        (branch) => !branch.isRemote,
      ),
    [selectedThreadBranchState.data?.refs],
  );

  return {
    gitOperationLabel,
    selectedThreadBranches,
    selectedThreadBranchesLoading: selectedThreadBranchState.isPending,
  };
}
