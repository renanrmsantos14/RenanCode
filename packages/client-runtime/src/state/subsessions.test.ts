import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { threadKey } from "./entities.ts";
import { groupSubsessionsByParent, subsessionParentRef } from "./subsessions.ts";

const env = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const tid = ThreadId.make;

const thread = (
  id: string,
  extra: Partial<Parameters<typeof subsessionParentRef>[0]> & {
    parent?: string;
    rel?: "subagent" | "fork";
  } = {},
) => {
  const { parent, rel, ...rest } = extra;
  return {
    id: tid(id),
    environmentId: env,
    creationSource: "web" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    lineage: {
      parentThreadId: parent === undefined ? null : tid(parent),
      relationshipToParent: rel ?? null,
      rootThreadId: tid(parent ?? id),
    },
    ...rest,
  };
};

describe("subsessionParentRef", () => {
  it.each([
    [
      "launchedFrom wins over the others",
      thread("c", {
        launchedFrom: tid("p"),
        parent: "q",
        rel: "subagent",
        creationSource: "mcp",
        delegatedFrom: { environmentId: remote, threadId: tid("r"), title: "r" },
      }),
      { environmentId: env, threadId: "p" },
    ],
    [
      "delegate_task child",
      thread("c", { parent: "q", rel: "subagent", creationSource: "mcp" }),
      { environmentId: env, threadId: "q" },
    ],
    [
      "remote delegation",
      thread("c", { delegatedFrom: { environmentId: remote, threadId: tid("r"), title: "r" } }),
      { environmentId: remote, threadId: "r" },
    ],
    [
      "provider subagent",
      thread("c", { parent: "q", rel: "subagent", creationSource: "provider" }),
      null,
    ],
    [
      "side chat",
      {
        ...thread("c", { launchedFrom: tid("p") }),
        lineage: {
          parentThreadId: tid("q"),
          relationshipToParent: "fork" as const,
          rootThreadId: tid("q"),
          sideChat: true as const,
        },
      },
      null,
    ],
    ["plain thread", thread("c"), null],
  ])("%s", (_name, input, expected) => {
    expect(subsessionParentRef(input as never)).toEqual(expected);
  });
});

describe("groupSubsessionsByParent", () => {
  it("sorts oldest first by id on ties, skips archived and hidden parents", () => {
    const parent = { environmentId: env, threadId: tid("p") };
    const threads = [
      thread("b", { launchedFrom: tid("p") }),
      thread("c", { launchedFrom: tid("p"), createdAt: "2025-12-31T00:00:00.000Z" }),
      thread("a", { launchedFrom: tid("p") }),
      thread("z", { launchedFrom: tid("p"), archivedAt: "2026-01-02T00:00:00.000Z" }),
      thread("h", { launchedFrom: tid("hidden") }),
    ];
    const grouped = groupSubsessionsByParent(threads, (ref) => ref.threadId !== "hidden");
    expect([...grouped.keys()]).toEqual([threadKey(parent)]);
    expect(grouped.get(threadKey(parent))?.map((t) => t.id)).toEqual(["c", "a", "b"]);
  });
});
