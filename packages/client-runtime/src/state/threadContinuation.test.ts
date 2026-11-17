import {
  EnvironmentId,
  MessageId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import {
  buildContinuationMessages,
  resolveContinuationWorkspace,
  findContinuationOf,
} from "./threadContinuation.ts";
import { v2Now, v2Projection, v2ThreadId } from "./orchestrationV2TestFixtures.ts";

function item(
  index: number,
  type: "user_message" | "assistant_message" | "reasoning",
  text: string,
  textOmitted = false,
): OrchestrationV2TurnItem {
  return {
    id: TurnItemId.make(`item-${index}`),
    threadId: v2ThreadId,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: index,
    status: "completed",
    title: null,
    startedAt: v2Now,
    completedAt: v2Now,
    updatedAt: v2Now,
    createdBy: "user",
    creationSource: "web",
    messageId: MessageId.make(`message-${index}`),
    text,
    ...(textOmitted ? { textOmitted: true } : {}),
    attachments: [],
    streaming: false,
    inputIntent: "turn_start",
    type,
  } as unknown as OrchestrationV2TurnItem;
}

function projectionOf(
  items: ReadonlyArray<OrchestrationV2TurnItem>,
  messages: OrchestrationV2ThreadProjection["messages"] = [],
): OrchestrationV2ThreadProjection {
  return {
    ...v2Projection,
    messages,
    turnItems: items,
    visibleTurnItems: items.map((it, position) => ({
      position,
      visibility: "local" as const,
      sourceThreadId: v2ThreadId,
      sourceItemId: it.id,
      item: it,
    })),
  };
}

describe("buildContinuationMessages", () => {
  it("keeps user and assistant text in order and restores deduped bodies", () => {
    const projection = projectionOf(
      [
        item(1, "user_message", "Fix it"),
        item(2, "reasoning", "thinking"),
        item(3, "assistant_message", "", true),
        item(4, "assistant_message", "  "),
      ],
      [{ id: MessageId.make("message-3"), text: "Fixed" } as never],
    );
    expect(buildContinuationMessages(projection).map(({ role, text }) => [role, text])).toEqual([
      ["user", "Fix it"],
      ["assistant", "Fixed"],
    ]);
  });

  it("cuts the oldest messages first by count and by size", () => {
    const projection = projectionOf([
      item(1, "user_message", "aaaa"),
      item(2, "assistant_message", "bbbb"),
      item(3, "user_message", "cccc"),
    ]);
    const texts = (limits: { maxMessages: number; maxBytes: number }) =>
      buildContinuationMessages(projection, limits).map((message) => message.text);
    expect(texts({ maxMessages: 2, maxBytes: 100 })).toEqual(["bbbb", "cccc"]);
    expect(texts({ maxMessages: 10, maxBytes: 9 })).toEqual(["bbbb", "cccc"]);
    expect(texts({ maxMessages: 10, maxBytes: 3 })).toEqual(["c"]);
  });
});

describe("continuation links", () => {
  const offline = EnvironmentId.make("offline");
  const online = EnvironmentId.make("online");
  const original = { environmentId: offline, threadId: ThreadId.make("original") };
  const make = (id: string, createdAt: string, from: typeof original | null) => ({
    environmentId: online,
    id: ThreadId.make(id),
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
    continuedFrom: from,
  });

  it("finds the oldest thread continued from the original", () => {
    const threads = [
      make("other", "2026-11-01T00:00:00.000Z", null),
      make("late", "2026-11-03T00:00:00.000Z", original),
      make("early", "2026-11-02T00:00:00.000Z", original),
    ];
    expect(findContinuationOf(threads, original)?.id).toBe("early");
    expect(findContinuationOf(threads.slice(0, 1), original)).toBeNull();
  });

  it("resolves the workspace from the destination refs", () => {
    const refs = [
      { name: "kept", worktreePath: "/wt/kept" },
      { name: "plain", worktreePath: null },
      { name: "origin/remote-only", isRemote: true, worktreePath: null },
      { name: "origin/team/nested", isRemote: true, worktreePath: null },
    ];
    expect(resolveContinuationWorkspace(null, refs)).toEqual({ kind: "root" });
    expect(resolveContinuationWorkspace("kept", refs)).toEqual({
      kind: "existing",
      branch: "kept",
      worktreePath: "/wt/kept",
    });
    expect(resolveContinuationWorkspace("plain", refs).kind).toBe("create");
    expect(resolveContinuationWorkspace("remote-only", refs).kind).toBe("create");
    expect(resolveContinuationWorkspace("gone", refs)).toEqual({ kind: "missing", branch: "gone" });
    expect(resolveContinuationWorkspace("nested", refs).kind).toBe("missing");
  });
});
