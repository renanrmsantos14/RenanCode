import type { WorkModuleId } from "@t3tools/contracts";

import type { WorkBoardHandlers, WorkBoardProject } from "./useWorkBoard";

export function WorkModulePanel(_props: {
  project: WorkBoardProject;
  moduleId: WorkModuleId;
  onClose: () => void;
  onUpdate: WorkBoardHandlers["onUpdate"];
}) {
  return null;
}
