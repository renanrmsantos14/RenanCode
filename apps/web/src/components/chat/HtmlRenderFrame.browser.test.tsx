import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render, type Screen } from "../../../test/render";

const assetUrl = vi.hoisted(() => ({ current: "about:blank" }));

vi.mock(import("~/assets/longLivedAssetUrls"), () => ({
  useLongLivedAssetUrl: () => ({
    _tag: "Success",
    url: assetUrl.current,
    expiresAt: Date.now() + 60 * 60_000,
  }),
}));
vi.mock(import("~/assets/assetUrls"), async (importOriginal) => ({
  ...(await importOriginal()),
  useAssetUrlRefresh: () => async () => "about:blank",
}));

import { HtmlRenderFrame } from "./HtmlRenderFrame";

function setup() {
  assetUrl.current = "about:blank";
}

const sizeChanged = (height: number, width?: number) => ({
  jsonrpc: "2.0",
  method: "ui/notifications/size-changed",
  params: { height, width },
});

function pageUrl(message: ReturnType<typeof sizeChanged>) {
  const html = `<script>parent.postMessage(${JSON.stringify(message)}, "*");</script>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  return { url, [Symbol.dispose]: () => URL.revokeObjectURL(url) };
}

const pageTransform = (screen: Screen) =>
  screen.getByTitle("Mockup").element().closest<HTMLElement>(".origin-top-left")?.style.transform;

describe("HtmlRenderFrame", () => {
  it("reports leaving full screen when it unmounts while expanded", async () => {
    setup();
    const onFullscreenChange = vi.fn();
    await using screen = await render(
      <HtmlRenderFrame
        environmentId={EnvironmentId.make("environment")}
        htmlRender={{ attachmentId: "attachment", title: "Report", height: 200 }}
        threadRef={undefined}
        onFullscreenChange={onFullscreenChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open full screen" }));
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    expect(onFullscreenChange).toHaveBeenLastCalledWith(true);

    await screen.unmount();
    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
  });

  it("hands full screen to the panel opener instead of a dialog when one is given", async () => {
    setup();
    const onOpenFullscreen = vi.fn();
    const htmlRender = { attachmentId: "panel", title: "Mockup", height: 200 };
    await using screen = await render(
      <HtmlRenderFrame
        environmentId={EnvironmentId.make("environment")}
        htmlRender={htmlRender}
        threadRef={undefined}
        onOpenFullscreen={onOpenFullscreen}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open full screen" }));
    expect(onOpenFullscreen).toHaveBeenCalledWith(htmlRender);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("reopens at the page height it last measured", async () => {
    setup();
    using page = (() => {
      const html = `<script>parent.postMessage(${JSON.stringify(sizeChanged(1500))}, "*");</script>`;
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      return { url, [Symbol.dispose]: () => URL.revokeObjectURL(url) };
    })();
    const frame = () => (
      <HtmlRenderFrame
        environmentId={EnvironmentId.make("environment")}
        htmlRender={{ attachmentId: "measured", title: "Mockup", height: 200 }}
        threadRef={undefined}
      />
    );
    const frameHeight = (screen: Screen) =>
      screen.getByTitle("Mockup").element().closest<HTMLElement>(".group\\/html-render")?.style
        .height;

    assetUrl.current = page.url;
    {
      await using first = await render(frame());
      await vi.waitFor(() => expect(frameHeight(first)).toBe("1500px"));
    }

    // A page that never reports its height, so only the remembered measurement can size the frame.
    assetUrl.current = "about:blank";
    await using second = await render(frame());
    expect(frameHeight(second)).toBe("1500px");
  });

  it("shrinks a page wider than its frame to fit", async () => {
    setup();
    using page = pageUrl(sizeChanged(200, 440));
    assetUrl.current = page.url;
    await using screen = await render(
      <div style={{ width: 300 }}>
        <HtmlRenderFrame
          environmentId={EnvironmentId.make("environment")}
          htmlRender={{ attachmentId: "fixed", title: "Mockup", height: 200 }}
          threadRef={undefined}
        />
      </div>,
    );
    await vi.waitFor(() => expect(pageTransform(screen)).toMatch(/^scale\(0\.68/));
  });

  it("keeps a fluid page unscaled after its column narrows", async () => {
    setup();
    using page = pageUrl(sizeChanged(321, 700));
    assetUrl.current = page.url;
    const frame = (width: number) => (
      <div style={{ width }}>
        <HtmlRenderFrame
          environmentId={EnvironmentId.make("environment")}
          htmlRender={{ attachmentId: "fluid", title: "Mockup", height: 200 }}
          threadRef={undefined}
        />
      </div>
    );
    const box = (screen: Screen) =>
      screen.getByTitle("Mockup").element().closest<HTMLElement>(".group\\/html-render");
    await using screen = await render(frame(700));
    await vi.waitFor(() => expect(box(screen)?.style.height).toBe("321px"));
    await screen.rerender(frame(500));
    await vi.waitFor(() => expect(box(screen)?.clientWidth).toBe(500));
    expect(pageTransform(screen)).toBe("");
  });
});
