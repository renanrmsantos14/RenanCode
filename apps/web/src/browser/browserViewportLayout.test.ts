import { describe, expect, it } from "vite-plus/test";

import {
  resizeBrowserViewportFromRail,
  resolveBrowserViewportLayout,
  resolveFittedBrowserViewport,
} from "./browserViewportLayout";

describe("resolveBrowserViewportLayout", () => {
  it("keeps an inset clear around the viewport without changing its aspect ratio", () => {
    const setting = { _tag: "preset", presetId: "iphone-12-pro", width: 390, height: 844 } as const;
    const inset = 28;
    const container = { width: 600, height: 700 };
    const layout = resolveBrowserViewportLayout(container, setting, 1.25, inset);
    const scaledInset = inset * 1.25 * layout.viewportScale;

    expect(layout.viewportWidth / layout.viewportHeight).toBeCloseTo(390 / 844, 5);
    expect(layout.viewportWidth / layout.viewportScale).toBeCloseTo(390 * 1.25, 5);
    expect(Number.isInteger(layout.viewportX) && Number.isInteger(layout.viewportY)).toBe(true);
    expect(layout.viewportY).toBeGreaterThanOrEqual(scaledInset);
    expect(layout.viewportY + layout.viewportHeight + scaledInset).toBeLessThanOrEqual(
      container.height + 1,
    );
  });

  it("preserves the last logical viewport when fitting a fill-mode surface", () => {
    expect(
      resolveFittedBrowserViewport({ _tag: "fill" }, { width: 320, height: 200, scale: 0.25 }),
    ).toEqual({ _tag: "freeform", width: 1280, height: 800 });
  });

  it("keeps the grabbed rail under the pointer across centered layout boundaries", () => {
    const available = { width: 1120, height: 818 };
    expect(
      resizeBrowserViewportFromRail(
        { width: 1120, height: 818 },
        { x: -100, y: -50 },
        available,
        1,
        "southeast",
      ),
    ).toEqual({ width: 920, height: 718 });
    expect(
      resizeBrowserViewportFromRail(
        { width: 800, height: 600 },
        { x: 300, y: 0 },
        { width: 1200, height: 800 },
        1,
        "east",
      ),
    ).toEqual({ width: 1300, height: 600 });
    expect(
      resizeBrowserViewportFromRail(
        { width: 560, height: 409 },
        { x: -100, y: 0 },
        available,
        2,
        "east",
      ),
    ).toEqual({ width: 460, height: 409 });
  });
});
