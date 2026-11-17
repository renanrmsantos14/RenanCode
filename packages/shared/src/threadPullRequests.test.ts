import type { ThreadPullRequestLink, ThreadPullRequestSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  threadPullRequestDelivery,
  threadPullRequestDeliveryForStatus,
} from "./threadPullRequests.ts";

function link(
  number: number,
  snapshot: Partial<ThreadPullRequestSnapshot> | null,
  source: ThreadPullRequestLink["source"] = "created",
): ThreadPullRequestLink {
  return {
    host: "github.com",
    repository: "owner/repository",
    number,
    url: `https://github.com/owner/repository/pull/${number}`,
    source,
    linkedAt: "2026-11-01T00:00:00.000Z",
    snapshot:
      snapshot === null
        ? null
        : {
            state: "open",
            title: `Pull request ${number}`,
            headBranch: "feature",
            baseBranch: "main",
            isDraft: false,
            updatedAt: "2026-11-01T00:00:00.000Z",
            syncedAt: "2026-11-01T00:00:00.000Z",
            ...snapshot,
          },
    stack: null,
  };
}

const stageOf = (links: ReadonlyArray<ThreadPullRequestLink>) => {
  const delivery = threadPullRequestDelivery(links);
  return delivery === null
    ? null
    : delivery.stage === "failed"
      ? `failed:${delivery.reason}:#${delivery.link.number}`
      : `${delivery.stage}:#${delivery.link.number}`;
};

describe("threadPullRequestDelivery", () => {
  it.each([
    ["no links", [], null],
    ["an unread link", [link(1, null)], null],
    ["open without checks", [link(1, {})], "ready:#1"],
    ["open with passing checks", [link(1, { checksState: "passing" })], "ready:#1"],
    ["a draft is just open", [link(1, { isDraft: true, checksState: "passing" })], "ready:#1"],
    ["running checks", [link(1, { checksState: "pending" })], "checks:#1"],
    ["failing checks", [link(1, { checksState: "failing" })], "failed:checks:#1"],
    [
      "a conflict outranks running checks",
      [link(1, { checksState: "pending", mergeability: "conflicting" })],
      "failed:conflict:#1",
    ],
    [
      "merged with checks running on the merge commit",
      [link(1, { state: "merged", mergeCommitChecksState: "pending" })],
      "merge-checks:#1",
    ],
    [
      "merged with failing merge commit checks",
      [link(1, { state: "merged", mergeCommitChecksState: "failing" })],
      "failed:merge-checks:#1",
    ],
    [
      "merged where the host reports no merge commit checks",
      [link(1, { state: "merged" })],
      "delivered:#1",
    ],
    ["closed unmerged", [link(1, { state: "closed" })], "closed:#1"],
    [
      "a failure in one pull request outranks a ready one",
      [link(1, { checksState: "passing" }), link(2, { checksState: "failing" })],
      "failed:checks:#2",
    ],
    [
      "a ready pull request outranks one still running",
      [link(1, { checksState: "pending" }), link(2, {})],
      "ready:#2",
    ],
    [
      "running work outranks a delivered one",
      [
        link(1, { state: "merged" }),
        link(2, { state: "merged", mergeCommitChecksState: "pending" }),
      ],
      "merge-checks:#2",
    ],
    [
      "a dismissed stack member does not count",
      [link(1, { state: "merged" }), link(2, { checksState: "failing" }, "stack-dismissed")],
      "delivered:#1",
    ],
  ] as const)("%s", (_name, links, expected) => {
    expect(stageOf(links)).toBe(expected);
  });
});

describe("threadPullRequestDeliveryForStatus", () => {
  const running = [link(1, { checksState: "pending" })];
  const ready = [link(1, {})];
  it.each([
    ["an idle agent shows a ready pull request", "ready", ready, "ready"],
    ["an agent waiting on the pull request shows its checks", "waiting", running, "checks"],
    ["an agent waiting on background work shows a ready one too", "waiting", ready, "ready"],
    ["a working agent shows checks it is likely waiting on", "working", running, "checks"],
    ["a working agent stays Working while the pull request awaits it", "working", ready, null],
    ["a question for the user outranks the pull request", "input", running, null],
    ["a failed run outranks the pull request", "failed", running, null],
  ] as const)("%s", (_name, status, links, expected) => {
    expect(threadPullRequestDeliveryForStatus(links, status)?.stage ?? null).toBe(expected);
  });
});
