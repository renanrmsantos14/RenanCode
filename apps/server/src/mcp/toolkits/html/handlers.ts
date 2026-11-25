import { DesignSketchId, OrchestratorMcpFailure } from "@t3tools/contracts";
import { DESIGN_SKETCH_DEFAULT_WIDTH } from "@t3tools/shared/design";
import * as Effect from "effect/Effect";

import * as DesignService from "../../../design/DesignService.ts";
import * as HtmlRender from "../../../htmlRender/HtmlRender.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { loadCaller } from "../../threadAccess.ts";
import { HtmlPreviewToolkit, HtmlRenderToolkit, type HtmlToolkit } from "./tools.ts";

const INVALID_PAGE_ERRORS = new Set([
  "DesignError",
  "HtmlRenderFileError",
  "HtmlRenderFileTooLargeError",
  "HtmlRenderImagesNotFoundError",
  "HtmlRenderImageTooLargeError",
  "HtmlRenderPageTooLargeError",
  "HtmlRenderViewportHeightError",
]);

const toFailure = (error: { readonly _tag: string; readonly message: string }) =>
  new OrchestratorMcpFailure({
    code: INVALID_PAGE_ERRORS.has(error._tag) ? "invalid_request" : "orchestration_error",
    message: error.message,
  });

// The server reads the file for the caller, so only a thread that reads files without asking may
// pass a path; a supervised thread passes the HTML its provider already let it read.
const pageSource = Effect.fn("HtmlToolkit.pageSource")(function* (input: {
  readonly html?: string | undefined;
  readonly path?: string | undefined;
}) {
  if (input.html !== undefined && input.path === undefined) {
    return { html: input.html } satisfies HtmlRender.HtmlRenderSource;
  }
  if (input.path === undefined || input.html !== undefined) {
    return yield* new OrchestratorMcpFailure({
      code: "invalid_request",
      message: "Pass exactly one of html or path.",
    });
  }
  const { limits } = yield* loadCaller();
  if (limits.runtimeMode !== "full-access") {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Pass html instead of path: only full-access threads may pass a path.",
    });
  }
  return { path: input.path } satisfies HtmlRender.HtmlRenderSource;
});

const handlers = {
  // Local-file access limits this host browser to T3-launched agents.
  html_preview: McpToolAccess.readsAsCaller((input) =>
    Effect.gen(function* () {
      const htmlRender = yield* HtmlRender.HtmlRender;
      const source = yield* pageSource(input);
      const { png, ...preview } = yield* htmlRender
        .preview({ ...source, width: input.width, appearance: input.appearance })
        .pipe(Effect.mapError(toFailure));
      return {
        ...preview,
        screenshot: {
          mimeType: "image/png" as const,
          data: png,
          width: preview.width,
          height: preview.capturedHeight,
        },
      };
    }),
  ),
  html_render: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "html_render");
      const htmlRender = yield* HtmlRender.HtmlRender;
      const source = yield* pageSource(input);
      const reference = yield* htmlRender
        .publish({ ...source, threadId: thread.threadId, title: input.title, height: input.height })
        .pipe(Effect.mapError(toFailure));
      return {
        htmlRender: reference,
        message:
          "Shown to the reader above your reply. Don't mention or describe the page; reply with only what it doesn't already say.",
      };
    }),
  ),
  html_variants: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "html_variants");
      const htmlRender = yield* HtmlRender.HtmlRender;
      const design = yield* DesignService.DesignService;
      const htmlRenders = yield* htmlRender
        .publishVariants({
          threadId: thread.threadId,
          variants: input.variants.map((variant) => ({ ...variant, title: input.title })),
        })
        .pipe(Effect.mapError(toFailure));
      // The pages are already in the thread, so a canvas that cannot take them costs only the Design copy.
      const { caller } = yield* loadCaller();
      const designSketches =
        caller === undefined
          ? undefined
          : yield* design
              .createSketches({
                threadId: thread.threadId,
                projectId: caller.projectId,
                pages: input.variants.map((variant) => ({
                  html: variant.html,
                  title: input.title,
                  label: variant.label,
                  width: DESIGN_SKETCH_DEFAULT_WIDTH,
                  height: variant.height,
                })),
              })
              .pipe(
                Effect.catch((error) =>
                  Effect.logWarning("html_variants could not save its Design sketches", error).pipe(
                    Effect.as(undefined),
                  ),
                ),
              );
      return {
        htmlRenders,
        ...(designSketches === undefined ? {} : { designSketches }),
        message: `Shown to the reader side by side above your reply, lettered A, B, C.${
          designSketches === undefined ? "" : " Also saved to this thread's Design section."
        } Don't describe them; say only how they differ if the labels don't.`,
      };
    }),
  ),
  design_sketch: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "design_sketch");
      const htmlRender = yield* HtmlRender.HtmlRender;
      const design = yield* DesignService.DesignService;
      const source = yield* pageSource(input);
      const { caller } = yield* loadCaller();
      if (caller === undefined) {
        return yield* new OrchestratorMcpFailure({
          code: "target_required",
          message: "design_sketch needs a T3 thread.",
        });
      }
      const html = yield* htmlRender.readPage(source).pipe(Effect.mapError(toFailure));
      const [designSketch] = yield* design
        .createSketches({
          threadId: thread.threadId,
          projectId: caller.projectId,
          ...(input.basedOn === undefined ? {} : { basedOn: DesignSketchId.make(input.basedOn) }),
          pages: [
            {
              html,
              title: input.title,
              width: input.width ?? DESIGN_SKETCH_DEFAULT_WIDTH,
              height: input.height,
            },
          ],
        })
        .pipe(Effect.mapError(toFailure));
      if (designSketch === undefined) {
        return yield* new OrchestratorMcpFailure({
          code: "orchestration_error",
          message: "The sketch was not saved.",
        });
      }
      return {
        designSketch,
        message:
          "Saved to this thread's Design section. Don't describe the page; reply with only what it doesn't already say.",
      };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof HtmlToolkit.tools>;

export const layerPreview = McpToolAccess.toLayer(HtmlPreviewToolkit, {
  html_preview: handlers.html_preview,
});

export const layerRender = McpToolAccess.toLayer(HtmlRenderToolkit, {
  html_render: handlers.html_render,
  html_variants: handlers.html_variants,
  design_sketch: handlers.design_sketch,
});
