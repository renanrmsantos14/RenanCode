import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createDesignEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    canvas: createEnvironmentRpcSubscriptionAtomFamily(runtime, {
      label: "environment-data:design:canvas",
      tag: WS_METHODS.designSubscribeCanvas,
    }),
    moveNodes: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:move-nodes",
      tag: WS_METHODS.designMoveNodes,
    }),
    setViewport: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:set-viewport",
      tag: WS_METHODS.designSetViewport,
    }),
    removeNode: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:remove-node",
      tag: WS_METHODS.designRemoveNode,
    }),
    setNodeZ: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:set-node-z",
      tag: WS_METHODS.designSetNodeZ,
    }),
    placeSketch: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:place-sketch",
      tag: WS_METHODS.designPlaceSketch,
    }),
    addFrame: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:add-frame",
      tag: WS_METHODS.designAddFrame,
    }),
    updateFrame: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:update-frame",
      tag: WS_METHODS.designUpdateFrame,
    }),
    setFrameSnapshot: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:set-frame-snapshot",
      tag: WS_METHODS.designSetFrameSnapshot,
    }),
    reportLiveFrame: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:report-live-frame",
      tag: WS_METHODS.designReportLiveFrame,
    }),
    setSelection: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:set-selection",
      tag: WS_METHODS.designSetSelection,
    }),
    listProjectSketches: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:design:list-project-sketches",
      tag: WS_METHODS.designListProjectSketches,
    }),
  };
}
