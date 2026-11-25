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

/** A sketch placed on a thread canvas. */
export const DesignSketchNode = Schema.Struct({
  id: DesignNodeId,
  kind: Schema.Literal("sketch"),
  sketchId: DesignSketchId,
  x: DesignLength,
  y: DesignLength,
  width: DesignLength,
  height: DesignLength,
  z: Schema.Int,
  /** Nodes the agent grouped share an id; the label is shown once above the group. */
  groupId: Schema.optionalKey(TrimmedNonEmptyString),
  groupLabel: Schema.optionalKey(DesignTitle),
});
export type DesignSketchNode = typeof DesignSketchNode.Type;

export const DesignFrameDevice = Schema.Literals(["desktop", "tablet", "mobile", "custom"]);
export type DesignFrameDevice = typeof DesignFrameDevice.Type;

const DesignFrameUrl = Schema.String.check(
  Schema.isMaxLength(2048),
  Schema.isPattern(/^https?:\/\/\S+$/i),
);

/** A running page placed on a thread canvas. Only the focused Frame is live; the others show a saved print. */
export const DesignFrameNode = Schema.Struct({
  id: DesignNodeId,
  kind: Schema.Literal("frame"),
  url: DesignFrameUrl,
  device: DesignFrameDevice,
  title: DesignTitle,
  snapshotAttachmentId: Schema.NullOr(DesignAttachmentId),
  x: DesignLength,
  y: DesignLength,
  width: DesignLength,
  height: DesignLength,
  z: Schema.Int,
  groupId: Schema.optionalKey(TrimmedNonEmptyString),
  groupLabel: Schema.optionalKey(DesignTitle),
});
export type DesignFrameNode = typeof DesignFrameNode.Type;

export const DesignCanvasNode = Schema.Union([DesignSketchNode, DesignFrameNode]);
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

const DesignFrameSize = Schema.Int.check(Schema.isBetween({ minimum: 240, maximum: 2400 }));

export const DesignAddFrameInput = Schema.Struct({
  threadId: ThreadId,
  url: DesignFrameUrl,
  device: DesignFrameDevice,
  title: Schema.optionalKey(DesignTitle),
  /** Only read for the custom device; presets have fixed sizes. */
  width: Schema.optionalKey(DesignFrameSize),
  height: Schema.optionalKey(DesignFrameSize),
  /** The Frame opened for the thread's dev server. The server creates it once per thread. */
  auto: Schema.optionalKey(Schema.Boolean),
});
export type DesignAddFrameInput = typeof DesignAddFrameInput.Type;

export const DesignUpdateFrameInput = Schema.Struct({
  threadId: ThreadId,
  nodeId: DesignNodeId,
  url: Schema.optionalKey(DesignFrameUrl),
  device: Schema.optionalKey(DesignFrameDevice),
  title: Schema.optionalKey(DesignTitle),
  width: Schema.optionalKey(DesignFrameSize),
  height: Schema.optionalKey(DesignFrameSize),
});
export type DesignUpdateFrameInput = typeof DesignUpdateFrameInput.Type;

const DESIGN_FRAME_SNAPSHOT_MAX_BASE64_LENGTH = 3_000_000;

export const DesignSetFrameSnapshotInput = Schema.Struct({
  threadId: ThreadId,
  nodeId: DesignNodeId,
  /** PNG, base64 without a data: prefix. */
  png: Schema.String.check(Schema.isMaxLength(DESIGN_FRAME_SNAPSHOT_MAX_BASE64_LENGTH)),
});
export type DesignSetFrameSnapshotInput = typeof DesignSetFrameSnapshotInput.Type;

/** Sketches per page of the project library; a page carries no HTML, only references. */
export const DESIGN_PROJECT_SKETCHES_PAGE_SIZE = 40;

export const DesignListProjectSketchesInput = Schema.Struct({
  projectId: ProjectId,
  /** The `nextCursor` of the previous page. */
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  /** Matches the sketch's title or label, ignoring case. */
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
});
export type DesignListProjectSketchesInput = typeof DesignListProjectSketchesInput.Type;

/** A sketch of the project library with where it came from; a deleted thread keeps its sketches. */
export const DesignProjectSketch = Schema.Struct({
  ...DesignSketch.fields,
  originThreadTitle: Schema.NullOr(Schema.String),
  originThreadDeleted: Schema.Boolean,
});
export type DesignProjectSketch = typeof DesignProjectSketch.Type;

export const DesignProjectSketchesPage = Schema.Struct({
  sketches: ForwardCompatibleArray(DesignProjectSketch),
  nextCursor: Schema.NullOr(Schema.String),
});
export type DesignProjectSketchesPage = typeof DesignProjectSketchesPage.Type;

export const DesignReportLiveFrameInput = Schema.Struct({
  threadId: ThreadId,
  nodeId: DesignNodeId,
  /** The preview tab the Frame runs in, or null once it stopped being live. */
  tabId: Schema.NullOr(TrimmedNonEmptyString.check(Schema.isMaxLength(256))),
});
export type DesignReportLiveFrameInput = typeof DesignReportLiveFrameInput.Type;

const DESIGN_SELECTION_MAX_BASE64_LENGTH = 3_000_000;

/** The element the user last picked in a Frame, kept for the agent's `design_selection_read`. */
export const DesignSelection = Schema.Struct({
  pageUrl: Schema.String.check(Schema.isMaxLength(2048)),
  tagName: Schema.String.check(Schema.isMaxLength(64)),
  selector: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2000))),
  htmlPreview: Schema.String.check(Schema.isMaxLength(20_000)),
  styles: Schema.String.check(Schema.isMaxLength(20_000)),
  comment: Schema.String.check(Schema.isMaxLength(4000)),
  /** PNG crop of the element, base64 without a data: prefix. */
  png: Schema.NullOr(Schema.String.check(Schema.isMaxLength(DESIGN_SELECTION_MAX_BASE64_LENGTH))),
  pickedAt: Schema.String,
});
export type DesignSelection = typeof DesignSelection.Type;

export const DesignSetSelectionInput = Schema.Struct({
  threadId: ThreadId,
  selection: DesignSelection,
});
export type DesignSetSelectionInput = typeof DesignSetSelectionInput.Type;

export class DesignError extends Schema.TaggedError<DesignError>()("DesignError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}
