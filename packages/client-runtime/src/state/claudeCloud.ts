import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as Persistence from "../platform/persistence.ts";
import { createEnvironmentRpcCommand } from "./runtime.ts";

export function createClaudeCloudEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | Persistence.EnvironmentCacheStore | R, E>,
) {
  return {
    startSession: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:claude-cloud:start-session",
      tag: WS_METHODS.claudeCloudStartSession,
    }),
  };
}
