import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createProjectChecklistEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    live: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:project-checklist:live",
      tag: WS_METHODS.projectChecklistSubscribe,
    }),
    upsert: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:project-checklist:upsert",
      tag: WS_METHODS.projectChecklistUpsert,
    }),
    move: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:project-checklist:move",
      tag: WS_METHODS.projectChecklistMove,
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:project-checklist:delete",
      tag: WS_METHODS.projectChecklistDelete,
    }),
  };
}
