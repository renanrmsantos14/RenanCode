import { OrchestratorMcpFailure } from "@t3tools/contracts";
import {
  HTML_RENDER_COLUMN_WIDTH,
  HTML_RENDER_LAYOUT_GUIDE,
  HTML_RENDER_MAX_FIT_HEIGHT,
  HTML_RENDER_MAX_HEIGHT,
  HTML_RENDER_MAX_TITLE_LENGTH,
  HTML_RENDER_MIN_HEIGHT,
  HTML_RENDER_THEME_GUIDE,
  HTML_RENDER_TOOL_NAME,
  HTML_VARIANT_MAX_LABEL_LENGTH,
  HTML_VARIANTS_MAX,
  HTML_VARIANTS_MIN,
  HTML_VARIANTS_TOOL_NAME,
} from "@t3tools/shared/htmlRender";
import {
  DESIGN_SKETCH_DEFAULT_WIDTH,
  DESIGN_SKETCH_MAX_HEIGHT,
  DESIGN_SKETCH_MAX_TITLE_LENGTH,
  DESIGN_SKETCH_MAX_WIDTH,
  DESIGN_SKETCH_MIN_HEIGHT,
  DESIGN_SKETCH_MIN_WIDTH,
  DESIGN_SKETCH_TOOL_NAME,
} from "@t3tools/shared/design";
import * as Schema from "effect/Schema";
import { McpSchema, Tool, Toolkit } from "effect/ai";

import * as DesignService from "../../../design/DesignService.ts";
import * as HtmlRender from "../../../htmlRender/HtmlRender.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const Html = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512_000)).annotate({
  description: "Inline HTML.",
});

const HtmlPath = Schema.String.annotate({
  description: "Absolute .html file path.",
});

const PAGE_RULES =
  "Self-contained: inline <style> and <script>. Local images as absolute paths are inlined. Remote URLs load as-is.";

export const HtmlPreviewTool = Tool.make("html_preview", {
  description: `Check an HTML page before html_render. Returns PNG, contentHeight, and console output. ${PAGE_RULES} Theme and layout rules are in html_render.`,
  parameters: Schema.Struct({
    path: Schema.optional(HtmlPath),
    html: Schema.optional(Html),
    width: Schema.optional(
      Schema.Int.annotate({
        description: `CSS pixels, 240 to 1600. Default ${HTML_RENDER_COLUMN_WIDTH}. Use about 390 for phones.`,
      }),
    ),
    appearance: Schema.optional(
      Schema.Literals(["dark", "light"]).annotate({
        description: "Default dark.",
      }),
    ),
  }),
  success: Schema.Struct({
    width: Schema.Int,
    contentHeight: Schema.Int,
    capturedHeight: Schema.Int,
    consoleMessages: Schema.Array(
      Schema.Struct({
        level: Schema.Literals(["log", "info", "warning", "error"]),
        text: Schema.String,
      }),
    ),
    missingImages: Schema.optional(Schema.Array(Schema.String)),
    screenshot: Schema.Struct({
      mimeType: Schema.Literal("image/png"),
      data: Schema.String,
      width: Schema.Int,
      height: Schema.Int,
    }),
  }),
  failure: OrchestratorMcpFailure,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    HtmlRender.HtmlRender,
  ],
})
  .annotate(Tool.Title, "Preview HTML")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true)
  .annotate(Tool.OpenWorld, true)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const DesignSketchReference = Schema.Struct({
  sketchId: Schema.String,
  attachmentId: Schema.String,
  thumbnailAttachmentId: Schema.NullOr(Schema.String),
  title: Schema.String,
  width: Schema.Number,
  height: Schema.Number,
  label: Schema.optional(Schema.String),
});

// This affects only the caller's thread, not its workspace, so read-only sandboxes and plan mode may use it.
const HtmlRenderTool = Tool.make(HTML_RENDER_TOOL_NAME, {
  description: `Show a finished HTML page (chart, diagram, mockup) inline in this thread, above your final reply. Do not announce or restate the page. Frame fits height to ${HTML_RENDER_MAX_FIT_HEIGHT}px. On mobile, content past the given height scrolls. ${HTML_RENDER_LAYOUT_GUIDE} ${HTML_RENDER_THEME_GUIDE}`,
  parameters: Schema.Struct({
    path: Schema.optional(HtmlPath),
    html: Schema.optional(Html),
    title: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(HTML_RENDER_MAX_TITLE_LENGTH),
    ),
    height: Schema.Int.annotate({
      description: `Frame height in CSS pixels, ${HTML_RENDER_MIN_HEIGHT} to ${HTML_RENDER_MAX_HEIGHT}. Use the contentHeight from html_preview.`,
    }),
  }),
  success: Schema.Struct({
    htmlRender: Schema.Struct({
      attachmentId: Schema.String,
      title: Schema.String,
      height: Schema.Number,
      heights: Schema.optional(Schema.Array(Schema.Tuple([Schema.Int, Schema.Int]))),
    }),
    message: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    HtmlRender.HtmlRender,
  ],
})
  .annotate(Tool.Title, "Render HTML")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

const HtmlVariantsTool = Tool.make(HTML_VARIANTS_TOOL_NAME, {
  description: `Show ${HTML_VARIANTS_MIN} to ${HTML_VARIANTS_MAX} alternative versions of one page side by side, when the user asks for options, alternatives, or variations of a visual. One page uses html_render. Check each page with html_preview first. Each label names what differs, without a letter prefix (A, B, C are added). ${PAGE_RULES} Theme and layout rules are in html_render.`,
  parameters: Schema.Struct({
    title: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(HTML_RENDER_MAX_TITLE_LENGTH),
    ),
    variants: Schema.Array(
      Schema.Struct({
        html: Html,
        label: Schema.String.check(
          Schema.isMinLength(1),
          Schema.isMaxLength(HTML_VARIANT_MAX_LABEL_LENGTH),
        ).annotate({ description: "What this variant changes, such as Dense cards." }),
        height: Schema.Int.annotate({
          description: `Frame height in CSS pixels, ${HTML_RENDER_MIN_HEIGHT} to ${HTML_RENDER_MAX_HEIGHT}. Use the contentHeight from html_preview.`,
        }),
      }),
    ).check(Schema.isMinLength(HTML_VARIANTS_MIN), Schema.isMaxLength(HTML_VARIANTS_MAX)),
  }),
  success: Schema.Struct({
    htmlRenders: Schema.Array(
      Schema.Struct({
        attachmentId: Schema.String,
        title: Schema.String,
        label: Schema.String,
        height: Schema.Number,
        heights: Schema.optional(Schema.Array(Schema.Tuple([Schema.Int, Schema.Int]))),
      }),
    ),
    designSketches: Schema.optional(Schema.Array(DesignSketchReference)),
    message: Schema.String,
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    HtmlRender.HtmlRender,
    DesignService.DesignService,
  ],
})
  .annotate(Tool.Title, "Render HTML variants")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

// Like html_render, it only touches the caller's thread and project canvas, so read-only sandboxes may use it.
const DesignSketchTool = Tool.make(DESIGN_SKETCH_TOOL_NAME, {
  description: `Explore an idea for an interface or screen as an HTML page. It opens in the thread's Design section, where the user can compare and refine it. For a chart or other data, use html_render. ${PAGE_RULES} Theme and layout rules are in html_render.`,
  parameters: Schema.Struct({
    path: Schema.optional(HtmlPath),
    html: Schema.optional(Html),
    title: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(DESIGN_SKETCH_MAX_TITLE_LENGTH),
    ),
    width: Schema.optional(
      Schema.Int.annotate({
        description: `CSS pixels, ${DESIGN_SKETCH_MIN_WIDTH} to ${DESIGN_SKETCH_MAX_WIDTH}. Default ${DESIGN_SKETCH_DEFAULT_WIDTH}. Use about 390 for phones.`,
      }),
    ),
    height: Schema.optional(
      Schema.Int.annotate({
        description: `CSS pixels, ${DESIGN_SKETCH_MIN_HEIGHT} to ${DESIGN_SKETCH_MAX_HEIGHT}. Default: the page's content height.`,
      }),
    ),
    basedOn: Schema.optional(
      Schema.String.annotate({
        description: "sketchId of an earlier sketch this one refines. It is placed beside it.",
      }),
    ),
  }),
  success: Schema.Struct({ designSketch: DesignSketchReference, message: Schema.String }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    HtmlRender.HtmlRender,
    DesignService.DesignService,
  ],
})
  .annotate(Tool.Title, "Sketch a design")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, true)
  .annotate(McpSchema.EnabledWhen, McpInvocationContext.hiddenFromOutsideClients);

export const HtmlPreviewToolkit = Toolkit.make(HtmlPreviewTool);

export const HtmlRenderToolkit = Toolkit.make(HtmlRenderTool, HtmlVariantsTool, DesignSketchTool);

export const HtmlToolkit = Toolkit.make(
  HtmlPreviewTool,
  HtmlRenderTool,
  HtmlVariantsTool,
  DesignSketchTool,
);
