import { vcsActionLabelText } from "@t3tools/client-runtime/state/vcs";
import { useMessages } from "gt-react-native";
import { useMemo } from "react";

import { dedupeRemoteBranchesWithLocalMatches } from "@t3tools/shared/git";

import { useBranches } from "./queries";
import { useVcsActionState } from "./use-vcs-action-state";
import type { GitRepositoryTarget } from "./thread-git-target";
import { useThreadSelection } from "./use-thread-selection";
import { useSelectedThreadWorktree } from "./use-selected-thread-worktree";

/** The running git action's label, without the branch list a screen header doesn't need. */
export function useSelectedThreadGitOperationLabel(repository?: GitRepositoryTarget) {
  const messages = useMessages();
  const { selectedThread } = useThreadSelection();
  const threadWorktree = useSelectedThreadWorktree();
  const gitActionState = useVcsActionState({
    environmentId: selectedThread?.environmentId ?? null,
    cwd: repository?.cwd ?? threadWorktree.selectedThreadCwd,
  });
  return vcsActionLabelText(gitActionState, messages);
}

/** Git state for the selected thread's own folder, or for `repository` when given. */
export function useSelectedThreadGitState(repository?: GitRepositoryTarget) {
  const { selectedThread } = useThreadSelection();
  const threadWorktree = useSelectedThreadWorktree();
  const selectedThreadCwd = repository?.cwd ?? threadWorktree.selectedThreadCwd;
  const gitOperationLabel = useSelectedThreadGitOperationLabel(repository);

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
  };
}
