import { createDesignEnvironmentAtoms } from "@t3tools/client-runtime/state/design";

import { connectionAtomRuntime } from "../connection/runtime";

export const designEnvironment = createDesignEnvironmentAtoms(connectionAtomRuntime);
