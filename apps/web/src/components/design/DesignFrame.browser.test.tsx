import {
  type DesignCanvasSnapshot,
  DesignNodeId,
  EnvironmentId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { useComposerDraftStore } from "~/composerDraftStore";
import { render } from "../../../test/render";

const mocks = vi.hoisted(() => ({
  moveNodes: vi.fn(),
  setViewport: vi.fn(),
  removeNode: vi.fn(),
  placeSketch: vi.fn(),
  addFrame: vi.fn(),
  pickElement: vi.fn(),
  setAnnotationSendEnabled: vi.fn(),
  cancelPickElement: vi.fn(),
}));

vi.mock(import("~/state/design"), () => ({
  designEnvironment: {
    moveNodes: "moveNodes",
    setViewport: "setViewport",
    removeNode: "removeNode",
    placeSketch: "placeSketch",
    addFrame: "addFrame",
  } as never,
}));
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((
    command: "moveNodes" | "setViewport" | "removeNode" | "placeSketch" | "addFrame",
  ) => mocks[command]) as never,
}));
vi.mock(import("./sketchAssets"), () => ({
  useSketchPageUrl: () => "about:blank",
  useSketchThumbnailUrl: () => null,
}));
vi.mock(import("../preview/previewBridge"), () => ({
  previewBridge: {
    pickElement: mocks.pickElement,
    setAnnotationSendEnabled: mocks.setAnnotationSendEnabled,
    cancelPickElement: mocks.cancelPickElement,
  } as never,
}));
vi.mock(import("../preview/focusPreviewWebview"), () => ({ focusPreviewWebview: () => {} }));
vi.mock(import("~/portDiscoveryState"), () => ({
  useDiscoveredPortsState: () =>
    ({
      servers: [
        {
          host: "localhost",
          port: 5173,
          url: "http://localhost:5173/",
          processName: "vite",
          pid: 1,
          terminal: null,
        },
      ],
      configuredUrlProbing: false,
    }) as never,
}));
vi.mock(import("./useDesignFrameLive"), () => ({
  useDesignFrameLive: ({ frame, live }: { frame: { id: string }; live: boolean }) =>
    live ? `runtime-${frame.id}` : null,
}));
vi.mock(import("~/browser/BrowserSurfaceSlot"), () => ({
  BrowserSurfaceSlot: (({ tabId }: { tabId: string }) => (
    <div data-testid="webview-slot" data-tab={tabId} />
  )) as never,
}));

import { DesignCanvas } from "./DesignCanvas";
import { useDesignFrameStore } from "./designFrameStore";

const environmentId = EnvironmentId.make("environment");
const threadRef = { environmentId, threadId: ThreadId.make("thread") };

const frameNode = (id: string, x: number, width: number, height: number) => ({
  id: DesignNodeId.make(id),
  kind: "frame" as const,
  url: "http://localhost:5173/",
  device: "desktop" as const,
  title: `Frame ${id}`,
  snapshotAttachmentId: null,
  x,
  y: 40,
  width,
  height,
  z: 0,
});

function snapshot(nodes: DesignCanvasSnapshot["nodes"]): DesignCanvasSnapshot {
  return {
    threadId: threadRef.threadId,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes,
    sketches: [],
  };
}

function setup() {
  for (const mock of Object.values(mocks)) mock.mockReset();
  for (const command of [mocks.moveNodes, mocks.setViewport, mocks.removeNode, mocks.placeSketch]) {
    command.mockResolvedValue({ _tag: "Success" });
  }
  mocks.setAnnotationSendEnabled.mockResolvedValue(undefined);
  useDesignFrameStore.setState({ focusedByThread: {}, addMenuOpen: {} });
  useComposerDraftStore.setState({ draftsByThreadKey: {} });
  return { [Symbol.dispose]: () => useDesignFrameStore.setState({ focusedByThread: {} }) };
}

function mount(canvas: DesignCanvasSnapshot) {
  const container = document.createElement("div");
  container.style.cssText = "position:relative;width:1000px;height:700px";
  return render(
    <DesignCanvas
      environmentId={environmentId}
      threadRef={threadRef}
      snapshot={canvas}
      canWrite
      maximized={false}
      onToggleMaximized={() => {}}
    />,
    { container },
  );
}

describe("Design Frames", () => {
  it("adds a Frame from the menu with the typed port, route and a size preset", async () => {
    using _setup = setup();
    mocks.addFrame.mockResolvedValue({
      _tag: "Success",
      value: frameNode("new-frame", 0, 390, 844),
    });
    await using _screen = await mount(snapshot([]));

    await userEvent.click(page.getByRole("button", { name: "Add Frame" }));
    await userEvent.click(page.getByRole("button", { name: /5173/ }));
    await userEvent.clear(page.getByRole("textbox", { name: "Route" }));
    await userEvent.type(page.getByRole("textbox", { name: "Route" }), "settings");
    await userEvent.click(page.getByRole("button", { name: "Mobile" }));
    await userEvent.click(page.getByRole("button", { name: "Add Frame" }).last());

    await vi.waitFor(() => expect(mocks.addFrame).toHaveBeenCalledTimes(1));
    expect(mocks.addFrame).toHaveBeenCalledWith({
      environmentId,
      input: {
        threadId: threadRef.threadId,
        url: "http://localhost:5173/settings",
        device: "mobile",
      },
    });
    expect(useDesignFrameStore.getState().focusedByThread).toEqual({
      "environment:thread": "new-frame",
    });
  });

  it("runs only the focused Frame live and shows the others as prints", async () => {
    using _setup = setup();
    await using screen = await mount(
      snapshot([frameNode("frame-a", 20, 300, 400), frameNode("frame-b", 360, 300, 400)]),
    );
    const live = (id: string) =>
      screen.container
        .querySelector(`[data-design-frame="${id}"]`)
        ?.getAttribute("data-design-frame-live");

    await vi.waitFor(() => expect(live("frame-a")).toBe("false"));
    expect(live("frame-b")).toBe("false");

    await userEvent.click(page.getByText("Frame frame-a"));
    await vi.waitFor(() => expect(live("frame-a")).toBe("true"));
    expect(live("frame-b")).toBe("false");

    await userEvent.click(page.getByText("Frame frame-b"));
    await vi.waitFor(() => expect(live("frame-b")).toBe("true"));
    expect(live("frame-a")).toBe("false");
    expect(screen.container.querySelectorAll("[data-testid=webview-slot]")).toHaveLength(1);
  });

  it("builds the composer context from a picked element and keeps the crop as an image", async () => {
    using _setup = setup();
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const picked = {
      id: "pick-1",
      pageUrl: "http://localhost:5173/",
      pageTitle: "App",
      comment: "",
      elements: [],
      regions: [],
      strokes: [],
      styleChanges: [],
      screenshot: {
        dataUrl: png,
        width: 1,
        height: 1,
        cropRect: { x: 0, y: 0, width: 1, height: 1 },
      },
      createdAt: "2026-11-25T00:00:00.000Z",
    };
    mocks.pickElement.mockResolvedValue({ annotation: picked, submission: "attach" });
    useDesignFrameStore.getState().focus(threadRef, "frame-a");
    await using _screen = await mount(snapshot([frameNode("frame-a", 20, 300, 400)]));

    await userEvent.click(page.getByRole("button", { name: "Select element" }));

    await vi.waitFor(() => {
      const draft = Object.values(useComposerDraftStore.getState().draftsByThreadKey)[0];
      expect(draft?.previewAnnotations.map((entry) => entry.id)).toEqual(["pick-1"]);
      expect(draft?.images.map((image) => image.id)).toEqual(["pick-1"]);
    });
    expect(mocks.setAnnotationSendEnabled).toHaveBeenCalledWith("runtime-frame-a", false);
    expect(mocks.pickElement).toHaveBeenCalledWith("runtime-frame-a");
  });
});
