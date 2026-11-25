import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";

import * as DesignService from "../../../design/DesignService.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as PreviewAutomationBroker from "../../PreviewAutomationBroker.ts";

const NodeId = Schema.String.annotate({ description: "nodeId from design_canvas_read." });

const CanvasNode = Schema.Struct({
  nodeId: Schema.String,
  kind: Schema.Literals(["sketch", "frame"]),
  title: Schema.String,
  label: Schema.optional(Schema.String),
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  group: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  device: Schema.optional(Schema.String),
  hasPrint: Schema.optional(Schema.Boolean),
});

const Coordinate = Schema.Number.check(Schema.isFinite());

const Screenshot = Schema.Struct({
  mimeType: Schema.Literal("image/png"),
  data: Schema.String,
  width: Schema.Int,
  height: Schema.Int,
});

// These only touch the caller's own thread canvas, so read-only sandboxes and plan mode may use them.
const DesignCanvasReadTool = Tool.make("design_canvas_read", {
  description:
    "List what is on this thread's Design canvas: sketches and Frames with id, title, position, size, group, and whether a Frame has a print. No HTML.",
  success: Schema.Struct({ nodes: Schema.Array(CanvasNode) }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    DesignService.DesignService,
  ],
})
  .annotate(Tool.Title, "Read the Design canvas")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const DesignFrameAddTool = Tool.make("design_frame_add", {
  description:
    "Add a Frame showing a running page to this thread's Design canvas. Pass `url`, or `port` (and optional `path`) for a local dev server. Placed below the rest.",
  parameters: Schema.Struct({
    url: Schema.optional(Schema.String.annotate({ description: "http(s) address." })),
    port: Schema.optional(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })).annotate({
        description: "Local dev server port. Opens http://localhost:<port><path>.",
      }),
    ),
    path: Schema.optional(Schema.String.annotate({ description: "With port. Default /." })),
    device: Schema.optional(
      Schema.Literals(["desktop", "tablet", "mobile"]).annotate({
        description: "Default desktop.",
      }),
    ),
    title: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))),
  }),
  success: Schema.Struct({ frame: CanvasNode, message: Schema.String }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    DesignService.DesignService,
  ],
})
  .annotate(Tool.Title, "Add a Frame")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const DesignCanvasArrangeTool = Tool.make("design_canvas_arrange", {
  description:
    "Organize this thread's Design canvas in one call. `moves` set positions and always win. `group` labels nodes; those without a move go side by side in a new row. `remove` takes nodes off the canvas; sketches stay in the project library.",
  parameters: Schema.Struct({
    moves: Schema.optional(
      Schema.Array(Schema.Struct({ nodeId: NodeId, x: Coordinate, y: Coordinate })).check(
        Schema.isMaxLength(100),
      ),
    ),
    group: Schema.optional(
      Schema.Struct({
        nodeIds: Schema.Array(NodeId).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
        label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
      }),
    ),
    remove: Schema.optional(Schema.Array(NodeId).check(Schema.isMaxLength(100))),
  }),
  success: Schema.Struct({ nodes: Schema.Array(CanvasNode) }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    DesignService.DesignService,
  ],
})
  .annotate(Tool.Title, "Arrange the Design canvas")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

export const DesignFrameScreenshotTool = Tool.make("design_frame_screenshot", {
  description:
    "PNG of a Frame on the Design canvas. Fresh when the user has it open on the desktop; otherwise its last saved print, with a note saying so.",
  parameters: Schema.Struct({ nodeId: NodeId }),
  success: Schema.Struct({
    nodeId: Schema.String,
    title: Schema.String,
    source: Schema.Literals(["live", "saved"]),
    note: Schema.optional(Schema.String),
    screenshot: Screenshot,
  }),
  failure: OrchestratorMcpFailure,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    DesignService.DesignService,
    PreviewAutomationBroker.PreviewAutomationBroker,
  ],
})
  .annotate(Tool.Title, "Screenshot a Frame")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

export const DesignSelectionReadTool = Tool.make("design_selection_read", {
  description:
    "The last element the user picked in a Frame of this thread: selector, HTML excerpt, styles, their comment, and a PNG crop. None if they have not picked one.",
  success: Schema.Struct({
    selection: Schema.NullOr(
      Schema.Struct({
        pageUrl: Schema.String,
        tagName: Schema.String,
        selector: Schema.NullOr(Schema.String),
        htmlPreview: Schema.String,
        styles: Schema.String,
        comment: Schema.String,
        pickedAt: Schema.String,
      }),
    ),
    message: Schema.optional(Schema.String),
    screenshot: Schema.optional(Screenshot),
  }),
  failure: OrchestratorMcpFailure,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    DesignService.DesignService,
  ],
})
  .annotate(Tool.Title, "Read the picked element")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, false)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

export const DesignCanvasToolkit = Toolkit.make(
  DesignCanvasReadTool,
  DesignFrameAddTool,
  DesignCanvasArrangeTool,
);

export const DesignImageToolkit = Toolkit.make(DesignFrameScreenshotTool, DesignSelectionReadTool);

export const DesignToolkit = Toolkit.make(
  DesignCanvasReadTool,
  DesignFrameAddTool,
  DesignCanvasArrangeTool,
  DesignFrameScreenshotTool,
  DesignSelectionReadTool,
);
