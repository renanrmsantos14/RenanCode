import { assert, describe, it, vi } from "@effect/vitest";
import {
  MessageId,
  ProjectId,
  RunId,
  TextGenerationError,
  ThreadId,
  type OrchestrationV2RunStatus,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as NextActionSuggestion from "./NextActionSuggestionService.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

const threadId = ThreadId.make("thread:next-action");
const projectId = ProjectId.make("project:next-action");
const runId = RunId.make("run:2");
const userMessageId = MessageId.make("message:user");

function makeLayer(input: {
  readonly status: OrchestrationV2RunStatus;
  readonly generate: TextGeneration.TextGeneration["Service"]["generateNextAction"];
}) {
  const thread = { id: threadId, projectId, worktreePath: "/repo/worktree" };
  const runs = [
    { id: RunId.make("run:1"), ordinal: 1, status: "completed", userMessageId },
    { id: runId, ordinal: 2, status: input.status, userMessageId },
  ];
  const messages = [
    { id: userMessageId, role: "user", text: "Add a retry", streaming: false },
    { id: MessageId.make("message:a1"), role: "assistant", text: "Looking.", streaming: false },
    {
      id: MessageId.make("message:a2"),
      role: "assistant",
      text: "Added the retry. Want me to run the tests?",
      streaming: false,
    },
  ];
  return NextActionSuggestion.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getThreadRecords: (_threadId, fields, filter) => {
            assert.deepStrictEqual(filter?.messageRunIds ?? [runId], [runId]);
            return Effect.succeed(
              ((fields as ReadonlyArray<string>).includes("runs")
                ? { thread, runs }
                : { thread, messages }) as never,
            );
          },
        }),
        Layer.mock(ProjectStore.ProjectStoreV2)({
          get: () => Effect.succeedSome({ workspaceRoot: "/repo" } as never),
        }),
        Layer.mock(TextGeneration.TextGeneration)({ generateNextAction: input.generate }),
        ServerSettings.layerTest({}),
      ),
    ),
  );
}

const suggest = Effect.flatMap(NextActionSuggestion.NextActionSuggestionService, (service) =>
  service.suggest({ threadId }),
);

describe("NextActionSuggestionService", () => {
  it.effect("suggests from the latest completed run's user message and final reply", () => {
    const generate = vi.fn<TextGeneration.TextGeneration["Service"]["generateNextAction"]>(() =>
      Effect.succeed({ suggestion: "Run the tests" }),
    );
    return Effect.gen(function* () {
      assert.deepStrictEqual(yield* suggest, { suggestion: "Run the tests" });
      const call = generate.mock.calls[0]?.[0];
      assert.strictEqual(call?.cwd, "/repo/worktree");
      assert.strictEqual(call?.lastUserMessage, "Add a retry");
      assert.strictEqual(call?.lastAssistantMessage, "Added the retry. Want me to run the tests?");
    }).pipe(Effect.provide(makeLayer({ status: "completed", generate })));
  });

  it.effect.each(["interrupted", "failed", "running"] as const)(
    "returns no suggestion when the latest run is %s",
    (status) => {
      const generate = vi.fn(() => Effect.succeed({ suggestion: "unused" }));
      return Effect.gen(function* () {
        assert.deepStrictEqual(yield* suggest, { suggestion: "" });
        assert.strictEqual(generate.mock.calls.length, 0);
      }).pipe(Effect.provide(makeLayer({ status, generate })));
    },
  );

  it.effect("returns no suggestion when the provider cannot generate one", () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* suggest, { suggestion: "" });
    }).pipe(
      Effect.provide(
        makeLayer({
          status: "completed",
          generate: () =>
            Effect.fail(
              new TextGenerationError({ operation: "generateNextAction", detail: "unsupported" }),
            ),
        }),
      ),
    ),
  );
});
