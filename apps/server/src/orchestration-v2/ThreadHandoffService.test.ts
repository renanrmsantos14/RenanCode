import { describe, expect, it } from "@effect/vitest";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";

import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadHandoffService from "./ThreadHandoffService.ts";
import * as ThreadLaunchService from "./ThreadLaunchService.ts";

const threadId = ThreadId.make("source-thread");
const newThreadId = ThreadId.make("handoff-thread");
const modelSelection = { instanceId: "codex", model: "gpt-5" };

const setup = (reply: string) => {
  const dispatched: Array<{ readonly threadId: string; readonly text: string }> = [];
  const launched: Array<
    Parameters<ThreadLaunchService.ThreadLaunchService["Service"]["launch"]>[0]
  > = [];
  let userMessageId = "";
  const dependencies = Layer.mergeAll(
    Layer.mock(Orchestrator.OrchestratorV2)({
      dispatch: (command) =>
        Effect.sync(() => {
          if (command.type === "message.dispatch") {
            userMessageId = command.messageId;
            dispatched.push({ threadId: command.threadId, text: command.text });
          }
          return { sequence: 1, storedEvents: [] };
        }),
    }),
    Layer.mock(ProjectionStore.ProjectionStoreV2)({
      getThread: () =>
        Effect.succeed({
          projectId: ProjectId.make("project"),
          title: "Big thread",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: "feature",
          worktreePath: "/work/tree",
        } as never),
      getThreadRecords: (_threadId, fields) =>
        Effect.sync(
          () =>
            ((fields as ReadonlyArray<string>).includes("runs")
              ? { runs: [{ id: "run-1", status: "completed", userMessageId }] }
              : { messages: [{ streaming: false, text: reply }] }) as never,
        ),
    }),
    Layer.mock(ThreadLaunchService.ThreadLaunchService)({
      launch: (input) =>
        Effect.sync(() => {
          launched.push(input);
          return { threadId: newThreadId } as never;
        }),
    }),
  );
  return { dependencies, dispatched, launched };
};

describe("ThreadHandoffService", () => {
  it.effect("opens a new thread in the same workspace with the model's summary", () =>
    Effect.gen(function* () {
      const { dependencies, dispatched, launched } = setup("Decisions: use Effect.");
      const service = yield* ThreadHandoffService.make.pipe(Effect.provide(dependencies));
      const result = yield* service.handoff({ threadId });

      expect(result).toEqual({ threadId: newThreadId });
      expect(dispatched).toEqual([
        { threadId, text: ThreadHandoffService.HANDOFF_SUMMARY_REQUEST },
      ]);
      expect(launched).toHaveLength(1);
      expect(launched[0]).toMatchObject({
        projectId: "project",
        modelSelection,
        workspaceStrategy: {
          type: "existing_worktree",
          worktreePath: "/work/tree",
          branch: "feature",
        },
        initialMessage: { text: expect.stringContaining("Decisions: use Effect.") },
      });
    }),
  );

  it.effect("fails without launching when the summary is empty", () =>
    Effect.gen(function* () {
      const { dependencies, launched } = setup("  ");
      const service = yield* ThreadHandoffService.make.pipe(Effect.provide(dependencies));
      const exit = yield* Effect.exit(service.handoff({ threadId }));

      expect(Exit.isFailure(exit)).toBe(true);
      expect(launched).toHaveLength(0);
    }),
  );
});
