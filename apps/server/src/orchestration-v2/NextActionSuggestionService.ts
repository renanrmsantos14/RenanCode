import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import type { NextActionSuggestionInput, NextActionSuggestionResult } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ServerSettings from "../serverSettings.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as ThreadManagementService from "./ThreadManagementService.ts";

const NO_SUGGESTION: NextActionSuggestionResult = { suggestion: "" };

export class NextActionSuggestionService extends Context.Service<
  NextActionSuggestionService,
  {
    /** Best effort: any failure yields an empty suggestion. */
    readonly suggest: (
      input: NextActionSuggestionInput,
    ) => Effect.Effect<NextActionSuggestionResult>;
  }
>()("t3/orchestration-v2/NextActionSuggestionService") {}

const make = Effect.gen(function* () {
  const threads = yield* ThreadManagementService.ThreadManagementService;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const textGeneration = yield* TextGeneration.TextGeneration;

  const suggest: NextActionSuggestionService["Service"]["suggest"] = Effect.fn(
    "NextActionSuggestionService.suggest",
  )(function* (input) {
    return yield* Effect.gen(function* () {
      const run = ThreadManagementService.latestRun(
        yield* threads.getThreadRecords(input.threadId, ["runs"]),
      );
      if (run?.status !== "completed") return NO_SUGGESTION;

      const projection = yield* threads.getThreadRecords(input.threadId, ["messages"], {
        messageRunIds: [run.id],
        messageRoles: ["user", "assistant"],
      });
      const messages = projection.messages.filter((message) => !message.streaming);
      const userMessage = messages.find((message) => message.id === run.userMessageId);
      const assistantMessage = messages.findLast((message) => message.role === "assistant");
      if (assistantMessage === undefined || assistantMessage.text.trim().length === 0) {
        return NO_SUGGESTION;
      }

      const project = yield* projects.get(projection.thread.projectId);
      if (Option.isNone(project)) return NO_SUGGESTION;
      const settings = resolveProjectSettings(
        yield* serverSettings.getSettings,
        projection.thread.projectId,
      ).settings;
      return yield* textGeneration.generateNextAction({
        cwd: projection.thread.worktreePath ?? project.value.workspaceRoot,
        lastUserMessage: userMessage?.text ?? "",
        lastAssistantMessage: assistantMessage.text,
        modelSelection: settings.textGenerationModelSelection,
      });
    }).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.interrupt
          : Effect.logWarning("Next action suggestion failed", {
              threadId: input.threadId,
              cause,
            }).pipe(Effect.as(NO_SUGGESTION)),
      ),
    );
  });

  return NextActionSuggestionService.of({ suggest });
});

export const layer = Layer.effect(NextActionSuggestionService, make);
