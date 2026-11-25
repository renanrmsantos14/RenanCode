import { OrchestratorMcpFailure, type ThreadId } from "@t3tools/contracts";
import { applyTaskPlanUpdate, formatTaskPlan, type TaskPlanItem } from "@t3tools/shared/taskPlan";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { MessageToolkit } from "./tools.ts";

// The plan the caller last sent, so advance and done/start apply to it. The client's copy
// comes from the adapter's plan events; after a restart the model resends items.
const plans = new Map<ThreadId, ReadonlyArray<TaskPlanItem>>();

const handlers = {
  send_to_user: McpToolAccess.actsAsCaller((input) =>
    Effect.succeed({
      sentMessage: input.message,
      message: "Shown to the user. Don't repeat it.",
    }),
  ),
  update_plan: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext.pipe(
        Effect.flatMap((context) =>
          McpInvocationContext.requireThreadScope(context, "update_plan"),
        ),
      );
      const threadId = scope.thread.threadId;
      const result = applyTaskPlanUpdate(plans.get(threadId), input);
      if (!result.ok) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: result.error,
        });
      }
      plans.set(threadId, result.items);
      return { plan: result.items, message: formatTaskPlan(result.items) };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof MessageToolkit.tools>;

export const layer = McpToolAccess.toLayer(MessageToolkit, handlers);
