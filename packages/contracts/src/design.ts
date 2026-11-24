import * as Schema from "effect/Schema";

import {
  DesignNodeId,
  DesignSketchId,
  ForwardCompatibleArray,
  IsoDateTime,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

const DesignTitle = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
const DesignAttachmentId = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const DesignLength = Schema.Number.check(Schema.isFinite());

/** A saved HTML screen. The HTML itself lives in an attachment, never in the snapshot. */
export const DesignSketch = Schema.Struct({
  id: DesignSketchId,
  projectId: ProjectId,
  originThreadId: ThreadId,
  /** Sketches created together (html_variants) share a group and are placed side by side. */
  groupId: Schema.NullOr(TrimmedNonEmptyString),
  basedOnSketchId: Schema.NullOr(DesignSketchId),
  title: DesignTitle,
  label: Schema.NullOr(DesignTitle),
  htmlAttachmentId: DesignAttachmentId,
  thumbnailAttachmentId: Schema.NullOr(DesignAttachmentId),
  width: Schema.Int,
  height: Schema.Int,
  createdAt: IsoDateTime,
});
export type DesignSketch = typeof DesignSketch.Type;

/** Only sketches today; phase 2 adds frames as another `kind`. */
export const DesignCanvasNode = Schema.Struct({
  id: DesignNodeId,
  kind: Schema.Literal("sketch"),
  sketchId: DesignSketchId,
  x: DesignLength,
  y: DesignLength,
  width: DesignLength,
  height: DesignLength,
  z: Schema.Int,
});
export type DesignCanvasNode = typeof DesignCanvasNode.Type;

export const DesignViewport = Schema.Struct({
  x: DesignLength,
  y: DesignLength,
  zoom: DesignLength.check(Schema.isGreaterThan(0)),
});
export type DesignViewport = typeof DesignViewport.Type;

export const DesignCanvasSnapshot = Schema.Struct({
  threadId: ThreadId,
  viewport: Schema.NullOr(DesignViewport),
  nodes: ForwardCompatibleArray(DesignCanvasNode),
  /** The sketches the nodes point to. */
  sketches: ForwardCompatibleArray(DesignSketch),
});
export type DesignCanvasSnapshot = typeof DesignCanvasSnapshot.Type;

export const DesignSubscribeCanvasInput = Schema.Struct({ threadId: ThreadId });
export type DesignSubscribeCanvasInput = typeof DesignSubscribeCanvasInput.Type;

export const DesignMoveNodesInput = Schema.Struct({
  threadId: ThreadId,
  nodes: Schema.Array(
    Schema.Struct({ nodeId: DesignNodeId, x: DesignLength, y: DesignLength }),
  ).check(Schema.isMaxLength(200)),
});
export type DesignMoveNodesInput = typeof DesignMoveNodesInput.Type;

export const DesignSetViewportInput = Schema.Struct({
  threadId: ThreadId,
  viewport: DesignViewport,
});
export type DesignSetViewportInput = typeof DesignSetViewportInput.Type;

export const DesignRemoveNodeInput = Schema.Struct({
  threadId: ThreadId,
  nodeId: DesignNodeId,
});
export type DesignRemoveNodeInput = typeof DesignRemoveNodeInput.Type;

export const DesignPlaceSketchInput = Schema.Struct({
  threadId: ThreadId,
  sketchId: DesignSketchId,
});
export type DesignPlaceSketchInput = typeof DesignPlaceSketchInput.Type;

export class DesignError extends Schema.TaggedError<DesignError>()("DesignError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
