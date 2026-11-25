import { OrchestratorMcpFailure } from "@t3tools/contracts";
import { TASK_PLAN_MAX_ITEMS, UPDATE_PLAN_TOOL_NAME } from "@t3tools/shared/taskPlan";
import { SEND_TO_USER_MAX_LENGTH, SEND_TO_USER_TOOL_NAME } from "@t3tools/shared/toolOutput";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

// Claude 5.1+ returns text written before a tool call only as a short summary; tool input arrives intact.
// It affects only the caller's thread, so read-only sandboxes and plan mode may use it.
const SendToUserTool = Tool.make(SEND_TO_USER_TOOL_NAME, {
  description:
    "Show the user a Markdown message in this thread, exactly as written, before your turn ends. Use it for content the user must read in full mid-turn, such as a draft, a code block, or what a question you are about to ask refers to. Don't repeat it in your reply.",
  parameters: Schema.Struct({
    message: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(SEND_TO_USER_MAX_LENGTH),
    ).annotate({ description: "Markdown, shown verbatim." }),
  }),
  success: Schema.Struct({
    sentMessage: Schema.String,
    message: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
})
  .annotate(Tool.Title, "Send a message to the user")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients)
  // Claude Code defers MCP tools behind ToolSearch; Anthropic says to declare this from the first request.
  .annotate(Tool.Meta, { "anthropic/alwaysLoad": true });

const TaskPlanStatus = Schema.Literals(["pending", "in_progress", "completed"]);
const TaskPlanItem = Schema.Struct({
  content: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)).annotate({
    description: "At most 7 words, imperative.",
  }),
  status: TaskPlanStatus,
});
const StepNumber = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));

// One object with optional fields: Claude requires an object at the top of a tool's input schema.
const UpdatePlanTool = Tool.make(UPDATE_PLAN_TOOL_NAME, {
  description:
    "Every task that edits files or runs more than one command has a plan. Send the full plan with the FIRST tool call of the turn (in parallel, never alone). Use advance: true with the call that starts the next step. If the plan changes, send items again. Don't repeat the plan in text. Send exactly one form: items (replaces the plan), advance: true (completes the in_progress step and starts the next pending one), or done/start (1-based step numbers, any order). At most one step is in_progress.",
  parameters: Schema.Struct({
    items: Schema.optional(
      Schema.Array(TaskPlanItem).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(TASK_PLAN_MAX_ITEMS),
      ),
    ).annotate({ description: `The whole plan, 1 to ${TASK_PLAN_MAX_ITEMS} steps.` }),
    scope: Schema.optional(Schema.Literals(["first_task", "continuation", "new_task"])),
    advance: Schema.optional(Schema.Literal(true)),
    done: Schema.optional(Schema.Array(StepNumber)).annotate({
      description: "Steps now completed.",
    }),
    start: Schema.optional(StepNumber).annotate({ description: "The step now in progress." }),
  }),
  success: Schema.Struct({
    plan: Schema.Array(TaskPlanItem),
    message: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
})
  .annotate(Tool.Title, "Update the task plan")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClientsAndSubagents)
  .annotate(Tool.Meta, { "anthropic/alwaysLoad": true });

export const MessageToolkit = Toolkit.make(SendToUserTool, UpdatePlanTool);
