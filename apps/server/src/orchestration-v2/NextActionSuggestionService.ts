import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import {
  CommandId,
  type OrchestrationV2Run,
  type OrchestrationV2RunNextActionSuggestion,
  type RunId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as EventSink from "./EventSink.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ThreadManagementService from "./ThreadManagementService.ts";

export class NextActionSuggestionService extends Context.Service<
  NextActionSuggestionService,
  {
    /**
     * Generates the suggestion for a completed run and records it on the run. Generation failures
     * record "none"; only failing to record is an error, so the effect is retried.
     */
    readonly execute: (input: {
      readonly threadId: ThreadId;
      readonly runId: RunId;
    }) => Effect.Effect<
      void,
      EventSink.EventSinkV2Error | IdAllocator.IdAllocatorV2AllocationError
    >;
  }
>()("t3/orchestration-v2/NextActionSuggestionService") {}

const make = Effect.gen(function* () {
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const textGeneration = yield* TextGeneration.TextGeneration;
  const eventSink = yield* EventSink.EventSinkV2;
  const ids = yield* IdAllocator.IdAllocatorV2;

  const generate = Effect.fn("NextActionSuggestionService.generate")(function* (
    threadId: ThreadId,
    run: OrchestrationV2Run,
  ) {
    const projection = yield* threads.getThreadRecords(threadId, ["messages"], {
      messageRunIds: [run.id],
      messageRoles: ["user", "assistant"],
    });
    const messages = projection.messages.filter((message) => !message.streaming);
    const userMessage = messages.find((message) => message.id === run.userMessageId);
    const assistantMessage = messages.findLast((message) => message.role === "assistant");
    if (assistantMessage === undefined || assistantMessage.text.trim().length === 0) return "";

    const project = yield* projects.get(projection.thread.projectId);
    if (Option.isNone(project)) return "";
    const settings = resolveProjectSettings(
      yield* serverSettings.getSettings,
      projection.thread.projectId,
    ).settings;
    const result = yield* textGeneration.generateNextAction({
      cwd: projection.thread.worktreePath ?? project.value.workspaceRoot,
      lastUserMessage: userMessage?.text ?? "",
      lastAssistantMessage: assistantMessage.text,
      modelSelection: settings.textGenerationModelSelection,
    });
    return result.suggestion.trim();
  });

  const execute: NextActionSuggestionService["Service"]["execute"] = Effect.fn(
    "NextActionSuggestionService.execute",
  )(function* (input) {
    const records = yield* threads.getThreadRecords(input.threadId, ["runs"]).pipe(Effect.orDie);
    const run = records.runs.find((candidate) => candidate.id === input.runId);
    // Already recorded: the effect is at-least-once.
    if (run?.nextActionSuggestion?.status !== "pending") return;

    // A newer turn makes this suggestion moot, but the run must still leave "pending".
    const text =
      run.status === "completed" && ThreadManagementService.latestRun(records)?.id === run.id
        ? yield* generate(input.threadId, run).pipe(
            Effect.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause)
                ? Effect.interrupt
                : Effect.logWarning("Next action suggestion failed", {
                    threadId: input.threadId,
                    runId: input.runId,
                    cause,
                  }).pipe(Effect.as("")),
            ),
          )
        : "";
    const nextActionSuggestion: OrchestrationV2RunNextActionSuggestion =
      text.length === 0 ? { status: "none" } : { status: "ready", text };

    const commandId = CommandId.make(`command:effect:next-action-suggestion:${run.id}:complete`);
    const occurredAt = yield* DateTime.now;
    yield* eventSink.commitCommand({
      commandId,
      threadId: input.threadId,
      commandType: "next-action-suggestion.complete",
      acceptedAt: occurredAt,
      effects: [],
      events: [
        {
          id: yield* ids.allocate.event({ threadId: input.threadId, commandId }),
          type: "run.next-action-suggestion-updated",
          threadId: input.threadId,
          runId: run.id,
          providerInstanceId: run.providerInstanceId,
          occurredAt,
          payload: { runId: run.id, nextActionSuggestion },
        },
      ],
    });
  });

  return NextActionSuggestionService.of({ execute });
});

export const layer = Layer.effect(NextActionSuggestionService, make);
