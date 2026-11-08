import { createWorkModuleEnvironmentAtoms } from "@t3tools/client-runtime/state/workModules";

import { connectionAtomRuntime } from "../connection/runtime";
import { environmentAtomList } from "./environmentAtomList";

export const workModuleEnvironment = createWorkModuleEnvironmentAtoms(connectionAtomRuntime);

export const workModulesLiveListAtom = environmentAtomList(
  "web-work-modules-live",
  (environmentId) => workModuleEnvironment.live({ environmentId, input: {} }),
);

export const workModuleWritePermissionsAtom = environmentAtomList(
  "web-work-module-write-permissions",
  workModuleEnvironment.upsert.permissionAtom,
);
