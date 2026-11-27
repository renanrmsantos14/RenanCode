import type { SnapShotSource } from "@t3tools/contracts";
import { use } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../../test/render";
import { AppAtomRegistryProvider } from "../../../rpc/atomRegistry";
import type { ExpandedImagePreview } from "../ExpandedImagePreview";
import { ReviewViewer } from "./ReviewViewer";
import { MediaReviewContext, useReviewMode, useThreadOpenMedia } from "./useReviewMode";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const snapShotSource: SnapShotSource = {
  kind: "snap-shot",
  capturedAt: "2026-01-01T00:00:00.000Z",
  appName: "Finder",
  windowTitle: "Downloads",
  accessibleText: "Downloads folder contents",
};

const D2_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1174 920"><rect width="1174" height="920"/></svg>';

const SOURCE = { cwd: undefined, hostImageUrl: null };
const SCOPE = "environment:thread";

function Opener({ preview }: { readonly preview: ExpandedImagePreview }) {
  const openMedia = use(MediaReviewContext);
  return (
    <button type="button" onClick={() => openMedia(preview)}>
      Open media
    </button>
  );
}

function Harness({ preview }: { readonly preview: ExpandedImagePreview }) {
  const review = useReviewMode(SCOPE);
  const openMedia = useThreadOpenMedia({ scope: SCOPE, entries: [], source: SOURCE });
  return (
    <MediaReviewContext value={openMedia}>
      <div className="flex h-[600px] w-[900px]">
        {review.active ? (
          <ReviewViewer
            review={review}
            scope={SCOPE}
            entries={[]}
            source={{ ...SOURCE, threadRef: null }}
          />
        ) : null}
        <Opener preview={preview} />
        <textarea aria-label="Composer" />
      </div>
    </MediaReviewContext>
  );
}

async function openReview(preview: ExpandedImagePreview) {
  const screen = await render(
    <AppAtomRegistryProvider>
      <Harness preview={preview} />
    </AppAtomRegistryProvider>,
    {
      // The viewer renders no links and reads no route.
      router: false,
    },
  );
  await userEvent.click(screen.getByRole("button", { name: "Open media" }));
  await expect.element(page.getByRole("region", { name: "Media review" })).toBeVisible();
  return screen;
}

const region = () => page.getByRole("region", { name: "Media review" });

describe("ReviewViewer", () => {
  it("opens media outside the gallery alone, focuses Close and returns focus on Escape", async () => {
    await using screen = await openReview({
      images: [{ src: PIXEL, name: "shot.png" }],
      index: 0,
    });
    await expect.element(page.getByRole("button", { name: "Close media review" })).toHaveFocus();
    await expect
      .element(page.getByRole("region", { name: "shot.png, zoomable image" }))
      .toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect.element(region()).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Open media" })).toHaveFocus();
  });

  it("closes on a click on the black stage", async () => {
    await using _screen = await openReview({
      images: [
        { src: PIXEL, name: "first.png" },
        { src: PIXEL, name: "second.png" },
      ],
      index: 0,
    });
    const stage = page.getByRole("button", { name: "Next media" }).element().parentElement;
    if (!stage) throw new Error("stage not found");
    const box = stage.getBoundingClientRect();
    await userEvent.click(stage, { position: { x: 4, y: box.height - 4 } });
    await expect.element(region()).not.toBeInTheDocument();
  });

  it("steps through images and videos with the arrow keys", async () => {
    await using _screen = await openReview({
      images: [
        { src: PIXEL, name: "first.png" },
        { src: "/clip.mp4", name: "clip.mp4", type: "video", autoPlay: false },
      ],
      index: 0,
    });
    await expect.element(region().getByText("1 / 2")).toBeVisible();
    const videoThumbnail = page.getByRole("button", { name: "Show media 2 of 2" }).element();
    expect(videoThumbnail.querySelector("img")).toBeNull();
    expect(videoThumbnail.querySelector("svg")).not.toBeNull();

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(region().getByText("2 / 2")).toBeVisible();
    await expect.element(region().getByText("clip.mp4")).toBeVisible();
    expect(region().element().querySelector("video")).not.toBeNull();

    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(region().getByText("1 / 2")).toBeVisible();
  });

  it("shows a failure when the image does not load", async () => {
    await using _screen = await openReview({
      images: [{ src: "/missing-review-image.png", name: "missing.png" }],
      index: 0,
    });
    await expect
      .element(page.getByText("Image unavailable. The file may have been moved or deleted."))
      .toBeVisible();
  });

  it("switches a screenshot to its extracted text and back", async () => {
    await using _screen = await openReview({
      images: [{ src: PIXEL, name: "shot.png", source: snapShotSource }],
      index: 0,
    });
    await userEvent.click(page.getByRole("button", { name: "Show extracted text" }));
    await expect.element(page.getByText("Downloads folder contents")).toBeVisible();

    await userEvent.click(page.getByRole("button", { name: "Show screenshot" }));
    await expect
      .element(page.getByRole("region", { name: "shot.png, zoomable image" }))
      .toBeVisible();
  });

  it.each(["/work/pipeline.svg", "/work/diagram#v2.svg", "/work/diagram?v2.svg"])(
    "fits a markdown SVG without intrinsic size to the viewer: %s",
    async (path) => {
      const src = URL.createObjectURL(new Blob([D2_SVG], { type: "image/svg+xml" }));
      using _src = { [Symbol.dispose]: () => URL.revokeObjectURL(src) };
      await using _screen = await openReview({
        images: [
          {
            src,
            name: "Pipeline",
            actionsSource: {
              kind: "image",
              name: "Pipeline",
              src,
              reference: { kind: "file", path },
            },
          },
        ],
        index: 0,
      });
      const viewer = page.getByRole("region", { name: "Pipeline, zoomable image" });
      const stage = region();
      await vi.waitFor(() =>
        expect(viewer.element().getBoundingClientRect().width).toBeGreaterThan(
          stage.element().getBoundingClientRect().width * 0.5,
        ),
      );
    },
  );

  it("leaves the arrow keys to the composer while the image is zoomed", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1200;
    await using screen = await openReview({
      images: [{ src: canvas.toDataURL(), name: "large.png" }],
      index: 0,
    });
    const viewportLocator = screen.getByRole("region", { name: "large.png, zoomable image" });
    const image = screen.getByRole("img", { name: "large.png" }).element() as HTMLElement;
    await vi.waitFor(() => expect(image.style.width).not.toBe(""));
    await userEvent.keyboard("{Control>}");
    await userEvent.wheel(viewportLocator, { delta: { y: -100 } });
    await userEvent.keyboard("{/Control}");
    const keys: boolean[] = [];
    const recordKey = (event: KeyboardEvent) => keys.push(event.defaultPrevented);
    window.addEventListener("keydown", recordKey);
    using _keyListener = {
      [Symbol.dispose]: () => window.removeEventListener("keydown", recordKey),
    };

    await userEvent.click(screen.getByRole("textbox", { name: "Composer" }));
    await userEvent.keyboard("{ArrowRight}{ArrowDown}");
    expect(keys).toEqual([false, false]);
  });

  it("scrolling pans the image while Ctrl+wheel zooms around the pointer", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1200;
    await using screen = await openReview({
      images: [{ src: canvas.toDataURL(), name: "large.png" }],
      index: 0,
    });
    const viewportLocator = screen.getByRole("region", { name: "large.png, zoomable image" });
    const viewport = viewportLocator.element() as HTMLElement;
    const image = screen.getByRole("img", { name: "large.png" }).element() as HTMLElement;
    await vi.waitFor(() => expect(image.style.width).not.toBe(""));
    const fitWidth = image.getBoundingClientRect().width;
    const wheels: { ctrlKey: boolean; canceled: boolean }[] = [];
    const recordWheel = (event: WheelEvent) =>
      wheels.push({ ctrlKey: event.ctrlKey, canceled: event.defaultPrevented });
    document.addEventListener("wheel", recordWheel);
    using _wheelListener = {
      [Symbol.dispose]: () => document.removeEventListener("wheel", recordWheel),
    };
    // Wheels land on the viewport's center; this is the image fraction under it.
    const pointerFraction = () => {
      const viewportBounds = viewport.getBoundingClientRect();
      const imageBounds = image.getBoundingClientRect();
      return {
        x: (viewportBounds.left + viewportBounds.width / 2 - imageBounds.left) / imageBounds.width,
        y: (viewportBounds.top + viewportBounds.height / 2 - imageBounds.top) / imageBounds.height,
      };
    };
    const ctrlWheel = async (deltaY: number) => {
      await userEvent.keyboard("{Control>}");
      await userEvent.wheel(viewportLocator, { delta: { y: deltaY } });
      await userEvent.keyboard("{/Control}");
    };

    await userEvent.wheel(viewportLocator, { delta: { y: 120 } });
    expect(wheels.at(-1)).toEqual({ ctrlKey: false, canceled: false });
    expect(image.getBoundingClientRect().width).toBe(fitWidth);

    await ctrlWheel(-100);
    expect(wheels.at(-1)).toEqual({ ctrlKey: true, canceled: true });
    const zoomedWidth = image.getBoundingClientRect().width;
    expect(zoomedWidth).toBeCloseTo(fitWidth * Math.E, 0);

    const pan = async (delta: { x: number; y: number }) => {
      const { scrollLeft, scrollTop } = viewport;
      await userEvent.wheel(viewportLocator, { delta });
      await vi.waitFor(() => {
        expect(Math.sign(viewport.scrollLeft - scrollLeft)).toBe(Math.sign(delta.x));
        expect(Math.sign(viewport.scrollTop - scrollTop)).toBe(Math.sign(delta.y));
      });
    };
    await pan({ x: 60, y: 0 });
    await pan({ x: 0, y: 60 });
    await pan({ x: -40, y: -40 });
    expect(wheels.filter((wheel) => !wheel.ctrlKey).every((wheel) => !wheel.canceled)).toBe(true);
    expect(image.getBoundingClientRect().width).toBe(zoomedWidth);

    const anchor = pointerFraction();
    await ctrlWheel(-20);
    expect(image.getBoundingClientRect().width).toBeGreaterThan(zoomedWidth);
    expect(pointerFraction().x).toBeCloseTo(anchor.x, 1);
    expect(pointerFraction().y).toBeCloseTo(anchor.y, 1);
  });
});
