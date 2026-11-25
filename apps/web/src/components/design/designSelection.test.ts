import type { PreviewAnnotationPayload } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { designSelectionFromAnnotation } from "./designSelection";

const rect = { x: 0, y: 0, width: 10, height: 10 };
const annotation = (overrides: Partial<PreviewAnnotationPayload> = {}): PreviewAnnotationPayload =>
  ({
    id: "a",
    pageUrl: "http://localhost:5173/",
    pageTitle: null,
    comment: "bigger",
    elements: [
      {
        id: "e",
        rect,
        element: {
          pageUrl: "http://localhost:5173/",
          pageTitle: null,
          tagName: "button",
          selector: "main > button",
          htmlPreview: "<button>Buy</button>",
          componentName: null,
          source: null,
          stack: [],
          styles: "color: red",
          pickedAt: "2026-11-25T12:00:00.000Z",
        },
      },
    ],
    regions: [],
    strokes: [],
    styleChanges: [],
    screenshot: { dataUrl: "data:image/png;base64,AAAA", width: 10, height: 10, cropRect: rect },
    createdAt: "2026-11-25T12:00:00.000Z",
    ...overrides,
  }) as PreviewAnnotationPayload;

describe("designSelectionFromAnnotation", () => {
  it("keeps the first element, the comment and the PNG crop", () => {
    expect(designSelectionFromAnnotation(annotation())).toEqual({
      pageUrl: "http://localhost:5173/",
      tagName: "button",
      selector: "main > button",
      htmlPreview: "<button>Buy</button>",
      styles: "color: red",
      comment: "bigger",
      png: "AAAA",
      pickedAt: "2026-11-25T12:00:00.000Z",
    });
  });

  it("drops a crop that is not a PNG or is missing, and a pick without an element", () => {
    expect(
      designSelectionFromAnnotation(
        annotation({
          screenshot: {
            dataUrl: "data:image/jpeg;base64,AAAA",
            width: 1,
            height: 1,
            cropRect: rect,
          },
        }),
      )?.png,
    ).toBeNull();
    expect(designSelectionFromAnnotation(annotation({ screenshot: null }))?.png).toBeNull();
    expect(designSelectionFromAnnotation(annotation({ elements: [] }))).toBeNull();
  });

  it("clips text to what the server accepts", () => {
    const selection = designSelectionFromAnnotation(annotation({ comment: "x".repeat(5000) }));
    expect(selection?.comment).toHaveLength(4000);
  });
});
