import { describe, expect, it } from "vite-plus/test";

import {
  clampDesignSketchWidth,
  DESIGN_CANVAS_GAP,
  placeSketches,
  readDesignSketchReference,
  readDesignSketchReferences,
} from "./design.ts";

const node = (x: number, y: number, width = 1280, height = 800) => ({ x, y, width, height });

describe("placeSketches", () => {
  it("starts an empty canvas at the origin and lines a group up side by side", () => {
    expect(
      placeSketches(
        [],
        [
          { width: 400, height: 300 },
          { width: 600, height: 500 },
        ],
      ),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 400 + DESIGN_CANVAS_GAP, y: 0 },
    ]);
  });

  it("puts a new group below everything already there, aligned to the left edge", () => {
    expect(
      placeSketches([node(100, 0), node(1500, 200, 400, 1000)], [{ width: 300, height: 300 }]),
    ).toEqual([{ x: 100, y: 1200 + DESIGN_CANVAS_GAP }]);
  });

  it("puts a version to the right of the original, on its row", () => {
    const original = node(0, 0, 1280, 800);
    expect(placeSketches([original], [{ width: 1280, height: 800 }], original)).toEqual([
      { x: 1280 + DESIGN_CANVAS_GAP, y: 0 },
    ]);
  });

  it("moves a second version past the first instead of covering it", () => {
    const original = node(0, 0);
    const first = node(1280 + DESIGN_CANVAS_GAP, 0);
    expect(placeSketches([original, first], [{ width: 1280, height: 800 }], original)).toEqual([
      { x: 2 * (1280 + DESIGN_CANVAS_GAP), y: 0 },
    ]);
  });

  it("returns nothing for no sketches", () => {
    expect(placeSketches([node(0, 0)], [])).toEqual([]);
  });
});

describe("design sketch references", () => {
  const reference = {
    sketchId: "s-1",
    attachmentId: "design-p-1-html",
    thumbnailAttachmentId: "design-p-2-png",
    title: " Home ",
    width: 1280,
    height: 900,
  };

  it("reads a reference and trims the title", () => {
    expect(readDesignSketchReference(reference)).toEqual({ ...reference, title: "Home" });
  });

  it("turns a missing thumbnail into null and rejects broken entries", () => {
    expect(
      readDesignSketchReference({ ...reference, thumbnailAttachmentId: undefined })
        ?.thumbnailAttachmentId,
    ).toBeNull();
    expect(readDesignSketchReference({ ...reference, attachmentId: "" })).toBeUndefined();
    expect(readDesignSketchReference("nope")).toBeUndefined();
    expect(readDesignSketchReferences([reference, { nope: true }])).toBeUndefined();
    expect(readDesignSketchReferences([reference])).toHaveLength(1);
  });

  it("keeps widths inside the supported range", () => {
    expect(clampDesignSketchWidth(undefined)).toBe(1280);
    expect(clampDesignSketchWidth(10)).toBe(240);
    expect(clampDesignSketchWidth(9999)).toBe(1920);
  });
});
