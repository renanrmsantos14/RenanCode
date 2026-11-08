import { OrchestratorMcpFailure, type WorkModule, WorkModuleError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as WorkModuleService from "../../../workModules/WorkModuleService.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { readThread, unavailable } from "../../threadAccess.ts";
import { formatWorkModule, formatWorkModuleTree } from "./format.ts";
import { WorkModulesToolkit } from "./tools.ts";

const invalid = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });

// WorkModuleError messages are written for people; anything else stays private.
const domain = (error: unknown) =>
  error instanceof WorkModuleError && error.cause === undefined
    ? invalid(error.message)
    : unavailable();

const ancestors = (module: WorkModule, modules: ReadonlyArray<WorkModule>) => {
  const titles: string[] = [];
  let parentId = module.parentId;
  while (parentId !== null) {
    const parent = modules.find((m) => m.id === parentId);
    if (parent === undefined) break;
    titles.unshift(parent.title);
    parentId = parent.parentId;
  }
  return titles;
};

const handlers = {
  t3_work_module_read: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const service = yield* WorkModuleService.WorkModuleService;
      const { modules, links } = yield* service.snapshot().pipe(Effect.mapError(domain));
      if (input.moduleId !== undefined) {
        const module = modules.find((m) => m.id === input.moduleId);
        if (module === undefined) return yield* invalid("The module was not found.");
        return { text: formatWorkModule(module, ancestors(module, modules), links) };
      }
      if (input.projectId !== undefined) {
        const inProject = modules.filter((m) => m.projectId === input.projectId);
        return { text: formatWorkModuleTree(inProject, links) };
      }
      const {
        projection: { thread },
      } = yield* readThread(undefined);
      const found = yield* service.moduleForThread(thread.id).pipe(Effect.mapError(domain));
      if (found === null) {
        const tree = formatWorkModuleTree(
          modules.filter((m) => m.projectId === thread.projectId),
          links,
        );
        return {
          text: `This thread is not linked to a module. Project tree (projectId ${thread.projectId}):\n${tree}`,
        };
      }
      const suffix = found.link.suggested
        ? "\n(Suggested link, not yet confirmed by the user.)"
        : "";
      return {
        text: formatWorkModule(found.module, ancestors(found.module, modules), links) + suffix,
      };
    }),
  ),
  t3_work_module_suggest: McpToolAccess.writes((input) =>
    Effect.gen(function* () {
      const service = yield* WorkModuleService.WorkModuleService;
      switch (input.action) {
        case "create": {
          if (input.projectId === undefined || input.title === undefined) {
            return yield* invalid("create needs projectId and title.");
          }
          const module = yield* service
            .upsert({
              projectId: input.projectId,
              parentId: input.parentModuleId ?? null,
              title: input.title,
              ...(input.text === undefined ? {} : { note: input.text }),
            })
            .pipe(Effect.mapError(domain));
          return { text: `Created ${module.title} as an idea (id ${module.id}).` };
        }
        case "link": {
          if (input.moduleId === undefined) return yield* invalid("link needs moduleId.");
          const {
            projection: { thread },
          } = yield* readThread(input.threadId);
          yield* service
            .linkThread({ threadId: thread.id, moduleId: input.moduleId, suggested: true })
            .pipe(Effect.mapError(domain));
          return { text: "Suggested. The user confirms or discards it on the board." };
        }
        case "note": {
          if (
            input.moduleId === undefined ||
            input.text === undefined ||
            input.text.trim() === ""
          ) {
            return yield* invalid("note needs moduleId and text.");
          }
          yield* service
            .appendAgentNote({ moduleId: input.moduleId, text: input.text })
            .pipe(Effect.mapError(domain));
          return { text: "Note appended." };
        }
      }
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof WorkModulesToolkit.tools>;

export const layer = McpToolAccess.toLayer(WorkModulesToolkit, handlers);
