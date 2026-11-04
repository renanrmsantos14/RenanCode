import {
  CommandId,
  MessageId,
  ThreadHandoffError,
  type ThreadHandoffInput,
  type ThreadHandoffResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ThreadLaunchService from "./ThreadLaunchService.ts";

const POLL_MS = 2_000;
const SUMMARY_TIMEOUT = Duration.minutes(10);

export const HANDOFF_SUMMARY_REQUEST = [
  "Write a handoff summary of this conversation so a fresh session can continue the work without the history.",
  "Use these sections, concise and specific: Decisions, Files changed, Running state (servers, branches, environment), Pending items, Next steps.",
  "Reply with the summary only.",
].join("\n");

const fail = (detail: string) => new ThreadHandoffError({ detail });

export class ThreadHandoffService extends Context.Service<
  ThreadHandoffService,
  {
    /** Asks the thread's own model for a summary, then opens a new thread in the same project with it. */
    readonly handoff: (
      input: ThreadHandoffInput,
    ) => Effect.Effect<ThreadHandoffResult, ThreadHandoffError>;
  }
>()("t3/orchestration-v2/ThreadHandoffService") {}

export const make = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const launches = yield* ThreadLaunchService.ThreadLaunchService;

  const awaitSummary = Effect.fn("ThreadHandoffService.awaitSummary")(function* (
    input: ThreadHandoffInput,
    messageId: MessageId,
  ) {
    while (true) {
      const records = yield* projections.getThreadRecords(input.threadId, ["runs"], {
        includeLatestRun: true,
      });
      const run = records.runs.find((candidate) => candidate.userMessageId === messageId);
      if (run?.status === "completed") {
        const projection = yield* projections.getThreadRecords(input.threadId, ["messages"], {
          messageRunIds: [run.id],
          messageRoles: ["assistant"],
        });
        const summary = projection.messages
          .filter((message) => !message.streaming)
          .findLast((message) => message.text.trim().length > 0)?.text;
        return summary ?? (yield* fail("The model returned an empty summary."));
      }
      if (run !== undefined && ["interrupted", "failed", "cancelled"].includes(run.status)) {
        return yield* fail("The summary turn did not complete.");
      }
      yield* Effect.sleep(Duration.millis(POLL_MS));
    }
  });

  const handoff: ThreadHandoffService["Service"]["handoff"] = Effect.fn(
    "ThreadHandoffService.handoff",
  )(
    function* (input) {
      const thread = yield* projections.getThread(input.threadId);
      const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
      const messageId = MessageId.make(`handoff:${input.threadId}:${nowMs}`);
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(`server:handoff:${input.threadId}:${nowMs}`),
        messageId,
        threadId: input.threadId,
        text: HANDOFF_SUMMARY_REQUEST,
        attachments: [],
        createdBy: "user",
        creationSource: "server",
        dispatchMode: { type: "start_immediately" },
      });
      const summary = yield* awaitSummary(input, messageId).pipe(
        Effect.timeoutOption(SUMMARY_TIMEOUT),
        Effect.flatMap((option) =>
          option._tag === "Some" ? Effect.succeed(option.value) : Effect.fail(fail("Timed out.")),
        ),
      );
      const launched = yield* launches.launch({
        commandId: CommandId.make(`server:handoff-launch:${input.threadId}:${nowMs}`),
        projectId: thread.projectId,
        title: `Handoff: ${thread.title}`,
        modelSelection: thread.modelSelection,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        workspaceStrategy:
          thread.worktreePath === null
            ? { type: "root", ...(thread.branch === null ? {} : { branch: thread.branch }) }
            : {
                type: "existing_worktree",
                worktreePath: thread.worktreePath,
                ...(thread.branch === null ? {} : { branch: thread.branch }),
              },
        initialMessage: {
          text: `Handoff from "${thread.title}":\n\n${summary}`,
          attachments: [],
        },
        createdBy: "user",
        creationSource: "server",
      });
      return { threadId: launched.threadId };
    },
    Effect.mapError((cause) =>
      cause._tag === "ThreadHandoffError" ? cause : fail("The handoff could not be completed."),
    ),
  );

  return ThreadHandoffService.of({ handoff });
});

export const layer = Layer.effect(ThreadHandoffService, make);
