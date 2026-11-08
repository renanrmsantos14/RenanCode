import type { WorkModuleStatus } from "@t3tools/contracts";

export const WORK_STATUS_LABEL: Record<WorkModuleStatus, string> = {
  idea: "Ideia",
  active: "Em andamento",
  waiting: "Esperando",
  done: "Finalizado",
};

export const WORK_STATUS_BADGE = {
  idea: "secondary",
  active: "info",
  waiting: "warning",
  done: "success",
} as const satisfies Record<WorkModuleStatus, "secondary" | "info" | "warning" | "success">;
