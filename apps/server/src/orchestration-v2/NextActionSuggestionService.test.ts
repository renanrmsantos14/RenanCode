import { assert, describe, it, vi } from "@effect/vitest";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import {
  MessageId,
  ProjectId,
  RunId,
  TextGenerationError,
  ThreadId,
  type OrchestrationV2RunNextActionSuggestion,
  type OrchestrationV2RunStatus,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as EventSink from "./EventSink.ts";
import * as NextActionSuggestion from "./NextActionSuggestionService.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";

const threadId = ThreadId.make("thread:next-action");
const projectId = ProjectId.make("project:next-action");
const runId = RunId.make("run:2");
const userMessageId = MessageId.make("message:user");

function makeLayer(input: {
  readonly status: OrchestrationV2RunStatus;
  readonly recorded?: OrchestrationV2RunNextActionSuggestion;
  readonly generate: TextGeneration.TextGeneration["Service"]["generateNextAction"];
  readonly commit: EventSink.EventSinkV2Shape["commitCommand"];
}) {
  const thread = { id: threadId, projectId, worktreePath: "/repo/worktree" };
  const runs = [
    { id: RunId.make("run:1"), ordinal: 1, status: "completed", userMessageId },
    {
      id: runId,
      ordinal: 2,
      status: input.status,
      userMessageId,
      providerInstanceId: "codex",
      nextActionSuggestion: input.recorded ?? { status: "pending" },
    },
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
        Layer.mock(EventSink.EventSinkV2)({ commitCommand: input.commit }),
        IdAllocator.layer,
        ServerSettings.layerTest({}),
      ),
    ),
  );
}

function recorder() {
  const recorded: OrchestrationV2RunNextActionSuggestion[] = [];
  const commit = vi.fn<EventSink.EventSinkV2Shape["commitCommand"]>((request) => {
    for (const event of request.events) {
      if (event.type === "run.next-action-suggestion-updated") {
        recorded.push(event.payload.nextActionSuggestion);
      }
    }
    return Effect.succeed({} as never);
  });
  return { recorded, commit };
}

const execute = Effect.flatMap(NextActionSuggestion.NextActionSuggestionService, (service) =>
  service.execute({ threadId, runId }),
);

describe("NextActionSuggestionService", () => {
  it.effect("records a suggestion from the run's user message and final reply", () => {
    const generate = vi.fn<TextGeneration.TextGeneration["Service"]["generateNextAction"]>(() =>
      Effect.succeed({ suggestion: "  Run the tests " }),
    );
    const { recorded, commit } = recorder();
    return Effect.gen(function* () {
      yield* execute;
      assert.deepStrictEqual(recorded, [{ status: "ready", text: "Run the tests" }]);
      const call = generate.mock.calls[0]?.[0];
      assert.strictEqual(call?.cwd, "/repo/worktree");
      assert.strictEqual(call?.lastUserMessage, "Add a retry");
      assert.strictEqual(call?.lastAssistantMessage, "Added the retry. Want me to run the tests?");
    }).pipe(Effect.provide(makeLayer({ status: "completed", generate, commit })));
  });

  it.effect.each(["interrupted", "failed", "running"] as const)(
    "records none without generating when the run is %s",
    (status) => {
      const generate = vi.fn(() => Effect.succeed({ suggestion: "unused" }));
      const { recorded, commit } = recorder();
      return Effect.gen(function* () {
        yield* execute;
        assert.deepStrictEqual(recorded, [{ status: "none" }]);
        assert.strictEqual(generate.mock.calls.length, 0);
      }).pipe(Effect.provide(makeLayer({ status, generate, commit })));
    },
  );

  it.effect.each([
    ["an empty suggestion", () => Effect.succeed({ suggestion: "  " })],
    [
      "a provider that cannot generate one",
      () =>
        Effect.fail(
          new TextGenerationError({ operation: "generateNextAction", detail: "unsupported" }),
        ),
    ],
  ] as const)("records none for %s", ([, generate]) => {
    const { recorded, commit } = recorder();
    return Effect.gen(function* () {
      yield* execute;
      assert.deepStrictEqual(recorded, [{ status: "none" }]);
    }).pipe(Effect.provide(makeLayer({ status: "completed", generate, commit })));
  });

  it.effect("leaves a run that already left pending alone when the effect is replayed", () => {
    const generate = vi.fn(() => Effect.succeed({ suggestion: "unused" }));
    const { recorded, commit } = recorder();
    return Effect.gen(function* () {
      yield* execute;
      assert.deepStrictEqual(recorded, []);
      assert.strictEqual(generate.mock.calls.length, 0);
    }).pipe(
      Effect.provide(
        makeLayer({
          status: "completed",
          recorded: { status: "ready", text: "Run the tests" },
          generate,
          commit,
        }),
      ),
    );
  });
});
