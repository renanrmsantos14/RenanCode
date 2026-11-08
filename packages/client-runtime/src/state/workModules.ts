import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createWorkModuleEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    live: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:work-modules:live",
      tag: WS_METHODS.workModulesSubscribe,
    }),
    upsert: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:work-modules:upsert",
      tag: WS_METHODS.workModulesUpsert,
    }),
    move: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:work-modules:move",
      tag: WS_METHODS.workModulesMove,
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:work-modules:delete",
      tag: WS_METHODS.workModulesDelete,
    }),
    linkThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:work-modules:link-thread",
      tag: WS_METHODS.workModulesLinkThread,
    }),
    unlinkThread: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:work-modules:unlink-thread",
      tag: WS_METHODS.workModulesUnlinkThread,
    }),
    confirmSuggestion: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:work-modules:confirm-suggestion",
      tag: WS_METHODS.workModulesConfirmSuggestion,
    }),
  };
}
