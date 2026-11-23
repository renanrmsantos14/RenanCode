import { createProjectChecklistEnvironmentAtoms } from "@t3tools/client-runtime/state/projectChecklist";

import { connectionAtomRuntime } from "../connection/runtime";

export const projectChecklistEnvironment =
  createProjectChecklistEnvironmentAtoms(connectionAtomRuntime);
