import {
  OrchestratorMcpFailure,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  WorkModuleId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as WorkModuleService from "../../../workModules/WorkModuleService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  success: Schema.Struct({ text: Schema.String }),
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    WorkModuleService.WorkModuleService,
  ],
};

const WorkModuleReadTool = Tool.make("t3_work_module_read", {
  ...shared,
  description:
    "Read the user's work board: modules nested under a project, with status, due date and threads. No args: this thread's module. `projectId`: the project's tree. `moduleId`: one module.",
  parameters: Schema.Struct({
    projectId: Schema.optional(ProjectId),
    moduleId: Schema.optional(WorkModuleId),
  }),
})
  .annotate(Tool.Title, "Read work board")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const WorkModuleSuggestTool = Tool.make("t3_work_module_suggest", {
  ...shared,
  description:
    "Suggest on the user's work board. create: new module (status idea). link: propose a thread (default this one) for a module; the user confirms. note: append a dated line to a module's note. Status, due date, title, moves and deletes are the user's.",
  parameters: Schema.Struct({
    action: Schema.Literals(["create", "link", "note"]),
    projectId: Schema.optional(ProjectId),
    parentModuleId: Schema.optional(WorkModuleId),
    moduleId: Schema.optional(WorkModuleId),
    threadId: Schema.optional(ThreadId),
    title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(200))),
    text: Schema.optional(Schema.String.check(Schema.isMaxLength(2000))),
  }),
})
  .annotate(Tool.Title, "Suggest on work board")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

export const WorkModulesToolkit = Toolkit.make(WorkModuleReadTool, WorkModuleSuggestTool);
