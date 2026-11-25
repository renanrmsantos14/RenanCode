export const DESIGN_SKETCH_TOOL_NAME = "design_sketch";
export const DESIGN_SKETCH_MIN_WIDTH = 240;
export const DESIGN_SKETCH_MAX_WIDTH = 1920;
export const DESIGN_SKETCH_DEFAULT_WIDTH = 1280;
export const DESIGN_SKETCH_MIN_HEIGHT = 80;
export const DESIGN_SKETCH_MAX_HEIGHT = 10_000;
/** A page that grows with its frame would otherwise get an enormous sketch. */
export const DESIGN_SKETCH_DEFAULT_MAX_HEIGHT = 4_000;
export const DESIGN_SKETCH_MAX_TITLE_LENGTH = 200;
export const DESIGN_CANVAS_GAP = 80;

export interface DesignSketchReference {
  readonly sketchId: string;
  readonly attachmentId: string;
  readonly thumbnailAttachmentId: string | null;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly label?: string;
}

export const designSketchReference = (sketch: {
  readonly id: string;
  readonly htmlAttachmentId: string;
  readonly thumbnailAttachmentId: string | null;
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly label: string | null;
}): DesignSketchReference => ({
  sketchId: sketch.id,
  attachmentId: sketch.htmlAttachmentId,
  thumbnailAttachmentId: sketch.thumbnailAttachmentId,
  title: sketch.title,
  width: sketch.width,
  height: sketch.height,
  ...(sketch.label === null ? {} : { label: sketch.label }),
});

export interface DesignRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const clampDesignSketchWidth = (width: number | undefined) =>
  width === undefined || !Number.isFinite(width)
    ? DESIGN_SKETCH_DEFAULT_WIDTH
    : Math.min(DESIGN_SKETCH_MAX_WIDTH, Math.max(DESIGN_SKETCH_MIN_WIDTH, Math.round(width)));

export const clampDesignSketchHeight = (height: number, max = DESIGN_SKETCH_MAX_HEIGHT) =>
  Math.min(max, Math.max(DESIGN_SKETCH_MIN_HEIGHT, Math.round(height)));

const boundedString = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined;

export function readDesignSketchReference(value: unknown): DesignSketchReference | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { sketchId, attachmentId, thumbnailAttachmentId, title, width, height, label } =
    value as Record<string, unknown>;
  const id = boundedString(sketchId, 256);
  const attachment = boundedString(attachmentId, 256);
  if (
    id === undefined ||
    attachment === undefined ||
    typeof title !== "string" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return undefined;
  }
  const thumbnail = boundedString(thumbnailAttachmentId, 256);
  const trimmedLabel = typeof label === "string" ? label.trim().slice(0, 40) : "";
  return {
    sketchId: id,
    attachmentId: attachment,
    thumbnailAttachmentId: thumbnail ?? null,
    title: title.trim().slice(0, DESIGN_SKETCH_MAX_TITLE_LENGTH) || "Sketch",
    width: clampDesignSketchWidth(width),
    height: clampDesignSketchHeight(height),
    ...(trimmedLabel === "" ? {} : { label: trimmedLabel }),
  };
}

export function readDesignSketchReferences(
  value: unknown,
): ReadonlyArray<DesignSketchReference> | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > 24) return undefined;
  const references = value.flatMap((entry) => {
    const reference = readDesignSketchReference(entry);
    return reference === undefined ? [] : [reference];
  });
  return references.length === value.length ? references : undefined;
}

const intersects = (a: DesignRect, b: DesignRect, margin: number) =>
  a.x < b.x + b.width + margin &&
  b.x < a.x + a.width + margin &&
  a.y < b.y + b.height + margin &&
  b.y < a.y + a.height + margin;

/**
 * Where a group of new sketches goes on a thread's canvas, one position per size, in order.
 * A group sits side by side; a new group goes below what is there. A version of an existing
 * sketch goes to its right, past anything already in that row.
 */
export function placeSketches(
  existing: ReadonlyArray<DesignRect>,
  sizes: ReadonlyArray<{ readonly width: number; readonly height: number }>,
  basedOn?: DesignRect,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  if (sizes.length === 0) return [];
  const rowWidth =
    sizes.reduce((total, size) => total + size.width, 0) + DESIGN_CANVAS_GAP * (sizes.length - 1);
  const rowHeight = Math.max(...sizes.map((size) => size.height));
  let startX: number;
  let y: number;
  if (basedOn !== undefined) {
    y = basedOn.y;
    startX = basedOn.x + basedOn.width + DESIGN_CANVAS_GAP;
    for (;;) {
      const row = { x: startX, y, width: rowWidth, height: rowHeight };
      const blocker = existing
        .filter((node) => intersects(row, node, DESIGN_CANVAS_GAP / 2))
        .reduce<DesignRect | undefined>(
          (rightmost, node) =>
            rightmost === undefined || node.x + node.width > rightmost.x + rightmost.width
              ? node
              : rightmost,
          undefined,
        );
      if (blocker === undefined) break;
      startX = blocker.x + blocker.width + DESIGN_CANVAS_GAP;
    }
  } else if (existing.length === 0) {
    startX = 0;
    y = 0;
  } else {
    startX = Math.min(...existing.map((node) => node.x));
    y = Math.max(...existing.map((node) => node.y + node.height)) + DESIGN_CANVAS_GAP;
  }
  let x = startX;
  return sizes.map((size) => {
    const position = { x, y };
    x += size.width + DESIGN_CANVAS_GAP;
    return position;
  });
}
