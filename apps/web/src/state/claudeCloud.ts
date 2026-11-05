import { createClaudeCloudEnvironmentAtoms } from "@t3tools/client-runtime/state/claudeCloud";

import { connectionAtomRuntime } from "../connection/runtime";

export const claudeCloudEnvironment = createClaudeCloudEnvironmentAtoms(connectionAtomRuntime);
