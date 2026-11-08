import type { WorkModuleFilters } from "@t3tools/client-runtime/workModuleTree";

import type { WorkBoardHandlers, WorkBoardProject } from "./useWorkBoard";

export function WorkKanban(
  _props: { projects: WorkBoardProject[]; filters: WorkModuleFilters } & WorkBoardHandlers,
) {
  return null;
}
