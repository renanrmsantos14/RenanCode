import type { WorkModuleStatus } from "@t3tools/contracts";
import { msg } from "gt-react";

/** `msg()` strings; render them through `useMessages()`. */
export const WORK_STATUS_LABEL: Record<WorkModuleStatus, string> = {
  idea: msg("Idea", { $context: "work module status" }),
  active: msg("In progress", { $context: "work module status" }),
  waiting: msg("Waiting", { $context: "work module status" }),
  done: msg("Done", { $context: "work module status" }),
};

export const WORK_STATUS_BADGE = {
  idea: "secondary",
  active: "info",
  waiting: "warning",
  done: "success",
} as const satisfies Record<WorkModuleStatus, "secondary" | "info" | "warning" | "success">;
