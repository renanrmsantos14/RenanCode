import { describe, expect, it } from "vite-plus/test";

import { draftWorktreeBaseBranch, isAutoRoutedDraft } from "./taskRouting";

const draft: Parameters<typeof isAutoRoutedDraft>[0] = {
  branch: null,
  worktreePath: null,
};

describe("task routing eligibility", () => {
  it("treats a draft without an explicit choice as Auto, even on a single machine", () => {
    expect(isAutoRoutedDraft(draft)).toBe(true);
    expect(isAutoRoutedDraft({ ...draft, environmentSelection: "auto" })).toBe(true);
    expect(isAutoRoutedDraft({ ...draft, environmentSelection: "auto", branch: "main" })).toBe(
      true,
    );
  });

  it("never auto-routes a manual machine, a cloud pick, a chosen branch or a worktree", () => {
    expect(isAutoRoutedDraft({ ...draft, environmentSelection: "manual" })).toBe(false);
    expect(isAutoRoutedDraft({ ...draft, environmentSelection: "claude-cloud" })).toBe(false);
    expect(isAutoRoutedDraft({ ...draft, branch: "main" })).toBe(false);
    expect(isAutoRoutedDraft({ ...draft, worktreePath: "/tmp/wt" })).toBe(false);
  });

  it("has a worktree base branch only before the worktree exists", () => {
    const worktree = { envMode: "worktree", branch: "main", worktreePath: null } as const;
    expect(draftWorktreeBaseBranch(worktree)).toBe("main");
    expect(draftWorktreeBaseBranch({ ...worktree, worktreePath: "/tmp/wt" })).toBeNull();
    expect(draftWorktreeBaseBranch({ ...worktree, envMode: "local" })).toBeNull();
  });
});
