import {
  DesignNodeId,
  OrchestratorMcpFailure,
  PreviewTabId,
  type DesignCanvasNode,
  type DesignCanvasSnapshot,
  type PreviewAutomationSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as DesignService from "../../../design/DesignService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as PreviewAutomationBroker from "../../PreviewAutomationBroker.ts";
import { DesignCanvasToolkit, DesignImageToolkit, type DesignToolkit } from "./tools.ts";

const LIVE_SNAPSHOT_TIMEOUT_MS = 8_000;

const toFailure = (error: { readonly message: string }) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message: error.message });

const summarize = (snapshot: Pick<DesignCanvasSnapshot, "nodes" | "sketches">) => {
  const sketches = new Map(snapshot.sketches.map((sketch) => [sketch.id, sketch]));
  return snapshot.nodes.map((node: DesignCanvasNode) => {
    const common = {
      nodeId: node.id,
      x: Math.round(node.x),
      y: Math.round(node.y),
      width: Math.round(node.width),
      height: Math.round(node.height),
      ...(node.groupLabel === undefined ? {} : { group: node.groupLabel }),
    };
    if (node.kind === "frame") {
      return {
        ...common,
        kind: "frame" as const,
        title: node.title,
        url: node.url,
        device: node.device,
        hasPrint: node.snapshotAttachmentId !== null,
      };
    }
    const sketch = sketches.get(node.sketchId);
    return {
      ...common,
      kind: "sketch" as const,
      title: sketch?.title ?? "Sketch",
      ...(sketch?.label ? { label: sketch.label } : {}),
    };
  });
};

const callerThread = Effect.fn("DesignToolkit.callerThread")(function* (tool: string) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  return yield* McpInvocationContext.requireThreadScope(scope, tool);
});

const framePath = (path: string | undefined) =>
  path === undefined || path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;

const handlers = {
  design_canvas_read: McpToolAccess.readsAsCaller(() =>
    Effect.gen(function* () {
      const { thread } = yield* callerThread("design_canvas_read");
      const design = yield* DesignService.DesignService;
      const snapshot = yield* design.snapshot(thread.threadId).pipe(Effect.mapError(toFailure));
      return { nodes: summarize(snapshot) };
    }),
  ),
  design_frame_add: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { thread } = yield* callerThread("design_frame_add");
      const design = yield* DesignService.DesignService;
      if ((input.url === undefined) === (input.port === undefined)) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "Pass exactly one of url or port.",
        });
      }
      const url = input.url ?? `http://localhost:${input.port}${framePath(input.path)}`;
      if (!/^https?:\/\/\S+$/i.test(url) || url.length > 2048) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "The Frame address must be an http(s) URL.",
        });
      }
      const frame = yield* design
        .addFrame({
          threadId: thread.threadId,
          url,
          device: input.device ?? "desktop",
          ...(input.title === undefined ? {} : { title: input.title }),
        })
        .pipe(Effect.mapError(toFailure));
      if (frame === null) {
        return yield* new OrchestratorMcpFailure({
          code: "orchestration_error",
          message: "The Frame was not added.",
        });
      }
      const [summary] = summarize({ nodes: [frame], sketches: [] });
      return {
        frame: summary!,
        message: "Added to this thread's Design canvas. Use design_frame_screenshot to see it.",
      };
    }),
  ),
  design_canvas_arrange: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const { thread } = yield* callerThread("design_canvas_arrange");
      const design = yield* DesignService.DesignService;
      if (
        (input.moves ?? []).length === 0 &&
        (input.group?.nodeIds.length ?? 0) === 0 &&
        (input.remove ?? []).length === 0
      ) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "Pass moves, group, or remove.",
        });
      }
      const nodes = yield* design
        .arrange({
          threadId: thread.threadId,
          ...(input.moves === undefined
            ? {}
            : {
                moves: input.moves.map((move) => ({
                  nodeId: DesignNodeId.make(move.nodeId),
                  x: move.x,
                  y: move.y,
                })),
              }),
          ...(input.group === undefined
            ? {}
            : {
                group: {
                  nodeIds: input.group.nodeIds.map((id) => DesignNodeId.make(id)),
                  label: input.group.label,
                },
              }),
          ...(input.remove === undefined
            ? {}
            : { remove: input.remove.map((id) => DesignNodeId.make(id)) }),
        })
        .pipe(Effect.mapError(toFailure));
      const snapshot = yield* design.snapshot(thread.threadId).pipe(Effect.mapError(toFailure));
      return { nodes: summarize({ nodes, sketches: snapshot.sketches }) };
    }),
  ),
  design_frame_screenshot: McpToolAccess.readsAsCaller((input) =>
    Effect.gen(function* () {
      const { thread } = yield* callerThread("design_frame_screenshot");
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const design = yield* DesignService.DesignService;
      const nodeId = DesignNodeId.make(input.nodeId);
      const snapshot = yield* design.snapshot(thread.threadId).pipe(Effect.mapError(toFailure));
      const frame = snapshot.nodes.find((node) => node.id === nodeId && node.kind === "frame");
      if (frame === undefined || frame.kind !== "frame") {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "That Frame is not on this thread's canvas. Call design_canvas_read for ids.",
        });
      }
      const tab = yield* design.liveFrameTab(thread.threadId, nodeId);
      const broker = yield* PreviewAutomationBroker.PreviewAutomationBroker;
      const live =
        tab === null || scope.thread === undefined || !scope.capabilities.has("preview")
          ? null
          : yield* broker
              .invoke<PreviewAutomationSnapshot>({
                scope: { ...scope, thread: scope.thread },
                operation: "snapshot",
                input: {},
                tabId: PreviewTabId.make(tab),
                timeoutMs: LIVE_SNAPSHOT_TIMEOUT_MS,
                updateCurrentTab: false,
              })
              .pipe(Effect.orElseSucceed(() => null));
      if (live?.screenshot?.data) {
        return {
          nodeId,
          title: frame.title,
          source: "live" as const,
          screenshot: live.screenshot,
        };
      }
      const saved = yield* design
        .readFramePrint(thread.threadId, nodeId)
        .pipe(Effect.mapError(toFailure));
      if (saved === null) {
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message:
            "This Frame has no print yet and is not open on the desktop. Ask the user to open it, then try again.",
        });
      }
      return {
        nodeId,
        title: frame.title,
        source: "saved" as const,
        note: "The Frame is not open on the desktop, so this is its last saved print and may be out of date.",
        screenshot: {
          mimeType: "image/png" as const,
          data: saved.png,
          width: saved.width,
          height: saved.height,
        },
      };
    }),
  ),
  design_selection_read: McpToolAccess.readsAsCaller(() =>
    Effect.gen(function* () {
      const { thread } = yield* callerThread("design_selection_read");
      const design = yield* DesignService.DesignService;
      const selection = yield* design.readSelection(thread.threadId);
      if (selection === null) {
        return {
          selection: null,
          message: "The user has not picked an element in a Frame of this thread.",
        };
      }
      const { png, ...rest } = selection;
      return {
        selection: rest,
        ...(png === null
          ? {}
          : {
              screenshot: {
                mimeType: "image/png" as const,
                data: png,
                ...pngSize(png),
              },
            }),
      };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof DesignToolkit.tools>;

function pngSize(base64: string) {
  const header = Buffer.from(base64.slice(0, 48), "base64");
  return header.length >= 24
    ? { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
    : { width: 1, height: 1 };
}

export const layerCanvas = McpToolAccess.toLayer(DesignCanvasToolkit, {
  design_canvas_read: handlers.design_canvas_read,
  design_frame_add: handlers.design_frame_add,
  design_canvas_arrange: handlers.design_canvas_arrange,
});

export const layerImages = McpToolAccess.toLayer(DesignImageToolkit, {
  design_frame_screenshot: handlers.design_frame_screenshot,
  design_selection_read: handlers.design_selection_read,
});
