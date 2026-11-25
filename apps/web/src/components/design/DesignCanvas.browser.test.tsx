import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  type DesignCanvasSnapshot,
  DesignNodeId,
  DesignSketchId,
  EnvironmentId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { cdp, page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { act, render } from "../../../test/render";

const mocks = vi.hoisted(() => ({
  moveNodes: vi.fn(),
  setViewport: vi.fn(),
  removeNode: vi.fn(),
  placeSketch: vi.fn(),
}));

vi.mock(import("~/state/design"), () => ({
  designEnvironment: {
    moveNodes: "moveNodes",
    setViewport: "setViewport",
    removeNode: "removeNode",
    placeSketch: "placeSketch",
  } as never,
}));
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: "moveNodes" | "setViewport" | "removeNode" | "placeSketch") =>
    mocks[command]) as never,
}));
vi.mock(import("./sketchAssets"), () => ({
  useSketchPageUrl: () => "about:blank",
  useSketchThumbnailUrl: () => null,
}));

import { DesignCanvas } from "./DesignCanvas";
import { useDesignFocusStore } from "./designFocusStore";

const environmentId = EnvironmentId.make("environment");
const threadRef = { environmentId, threadId: ThreadId.make("thread") };
const sketchIds = ["sketch-a", "sketch-b"].map((id) => DesignSketchId.make(id));
const nodeIds = ["node-a", "node-b"].map((id) => DesignNodeId.make(id));

function snapshot(count: number): DesignCanvasSnapshot {
  return {
    threadId: threadRef.threadId,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: sketchIds.slice(0, count).map((sketchId, index) => ({
      id: nodeIds[index]!,
      kind: "sketch" as const,
      sketchId,
      x: index * 460,
      y: 40,
      width: 400,
      height: 500,
      z: index,
    })),
    sketches: sketchIds.slice(0, count).map((id, index) => ({
      id,
      projectId: ProjectId.make("project"),
      originThreadId: threadRef.threadId,
      groupId: null,
      basedOnSketchId: null,
      title: `Home ${index === 0 ? "A" : "B"}`,
      label: null,
      htmlAttachmentId: `${id}.html`,
      thumbnailAttachmentId: null,
      width: 400,
      height: 500,
      createdAt: "2026-01-01T00:00:00.000Z",
    })) as never,
  };
}

// The mocked commands and the focus store outlive a test, so each one starts by resetting them.
function setup() {
  for (const command of Object.values(mocks))
    command.mockReset().mockResolvedValue({ _tag: "Success" });
  useDesignFocusStore.setState({ pending: {} });
  return { [Symbol.dispose]: () => useDesignFocusStore.setState({ pending: {} }) };
}

// d3-drag follows real mouse events, which an HTML5 drag-and-drop would not send.
async function dragBy(element: HTMLElement, dx: number, dy: number) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + 60;
  const y = rect.top + 120;
  const session = cdp();
  const mouse = (
    type: "mouseMoved" | "mousePressed" | "mouseReleased",
    at: { x: number; y: number },
    buttons: number,
  ) =>
    session.send("Input.dispatchMouseEvent", {
      type,
      ...at,
      button: type === "mouseMoved" && buttons === 0 ? "none" : "left",
      buttons,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
  await mouse("mouseMoved", { x, y }, 0);
  await mouse("mousePressed", { x, y }, 1);
  for (const step of [0.25, 0.5, 0.75, 1]) {
    await mouse("mouseMoved", { x: x + dx * step, y: y + dy * step }, 1);
  }
  await mouse("mouseReleased", { x: x + dx, y: y + dy }, 0);
}

function mount(canvas: DesignCanvasSnapshot, canWrite = true) {
  const container = document.createElement("div");
  container.style.cssText = "position:relative;width:1000px;height:700px";
  return render(
    <DesignCanvas
      environmentId={environmentId}
      threadRef={threadRef}
      snapshot={canvas}
      canWrite={canWrite}
      maximized={false}
      onToggleMaximized={() => {}}
    />,
    { container },
  );
}

describe("DesignCanvas", () => {
  it("shows the empty state and no nodes when nothing was designed yet", async () => {
    using _setup = setup();
    await using screen = await mount(snapshot(0));

    await expect.element(screen.getByText(/No sketches yet/)).toBeVisible();
    expect(screen.container.querySelectorAll(".react-flow__node")).toHaveLength(0);
  });

  it("renders a node per sketch with its title", async () => {
    using _setup = setup();
    await using screen = await mount(snapshot(2));

    await expect.element(screen.getByRole("button", { name: "Open sketch Home A" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Open sketch Home B" })).toBeVisible();
    expect(screen.container.querySelectorAll(".react-flow__node")).toHaveLength(2);
    expect(screen.getByText(/No sketches yet/).elements()).toHaveLength(0);
  });

  it("outlines nodes the agent grouped and shows the group label once", async () => {
    using _setup = setup();
    const base = snapshot(2);
    const grouped = {
      ...base,
      nodes: base.nodes.map((node) => ({ ...node, groupId: "g1", groupLabel: "Checkout flow" })),
    } as DesignCanvasSnapshot;
    await using screen = await mount(grouped);

    await expect.element(screen.getByText("Checkout flow")).toBeVisible();
    expect(screen.getByText("Checkout flow").elements()).toHaveLength(1);
    expect(screen.container.querySelectorAll(".react-flow__node")).toHaveLength(3);
  });

  it("saves positions with moveNodes only when the drag ends", async () => {
    using _setup = setup();
    await using screen = await mount(snapshot(1));
    const node = await vi.waitUntil(() =>
      screen.container.querySelector<HTMLElement>(".react-flow__node"),
    );

    await act(() => dragBy(node, 200, 200));

    await vi.waitFor(() => expect(mocks.moveNodes).toHaveBeenCalledOnce());
    const call = mocks.moveNodes.mock.calls[0]?.[0] as {
      input: { threadId: string; nodes: Array<{ nodeId: string; x: number; y: number }> };
    };
    expect(call.input.threadId).toBe(threadRef.threadId);
    expect(call.input.nodes).toHaveLength(1);
    expect(call.input.nodes[0]?.nodeId).toBe("node-a");
    expect(call.input.nodes[0]?.x).toBeGreaterThan(100);
    expect(call.input.nodes[0]?.y).toBeGreaterThan(100);
  });

  it("does not let a viewer without write access drag nodes", async () => {
    using _setup = setup();
    await using screen = await mount(snapshot(1), false);
    const node = await vi.waitUntil(() =>
      screen.container.querySelector<HTMLElement>(".react-flow__node"),
    );

    await act(() => dragBy(node, 200, 200));

    expect(mocks.moveNodes).not.toHaveBeenCalled();
    await expect.element(screen.getByRole("button", { name: "Remove from canvas" })).toBeDisabled();
  });

  it("selects the sketch a chat card asked for and consumes the request", async () => {
    using _setup = setup();
    useDesignFocusStore.getState().request(threadRef, "sketch-b");
    await using screen = await mount(snapshot(2));

    await vi.waitFor(() => {
      const selected = screen.container.querySelectorAll(".react-flow__node.selected");
      expect(selected).toHaveLength(1);
      expect(selected[0]?.getAttribute("data-id")).toBe("node-b");
    });
    expect(useDesignFocusStore.getState().pending[scopedThreadKey(threadRef)]).toBeUndefined();
  });

  it("places a known sketch that has no node yet, then focuses it once the node arrives", async () => {
    using _setup = setup();
    useDesignFocusStore.getState().request(threadRef, "sketch-b");
    const full = snapshot(2);
    const unplaced = { ...full, nodes: full.nodes.slice(0, 1) };
    await using screen = await mount(unplaced);

    await vi.waitFor(() => expect(mocks.placeSketch).toHaveBeenCalledOnce());
    expect(mocks.placeSketch.mock.calls[0]?.[0]).toMatchObject({
      environmentId,
      input: { threadId: threadRef.threadId, sketchId: "sketch-b" },
    });
    expect(useDesignFocusStore.getState().pending[scopedThreadKey(threadRef)]).toBe("sketch-b");

    await screen.rerender(
      <DesignCanvas
        environmentId={environmentId}
        threadRef={threadRef}
        snapshot={full}
        canWrite
        maximized={false}
        onToggleMaximized={() => {}}
      />,
    );
    await vi.waitFor(() => {
      expect(
        screen.container.querySelector(".react-flow__node.selected")?.getAttribute("data-id"),
      ).toBe("node-b");
    });
    expect(useDesignFocusStore.getState().pending[scopedThreadKey(threadRef)]).toBeUndefined();
  });

  it("drops a focus request for a sketch that is not on the canvas and cannot be placed", async () => {
    using _setup = setup();
    useDesignFocusStore.getState().request(threadRef, "sketch-missing");
    await using _screen = await mount(snapshot(2));

    await vi.waitFor(() =>
      expect(useDesignFocusStore.getState().pending[scopedThreadKey(threadRef)]).toBeUndefined(),
    );
    expect(mocks.placeSketch).not.toHaveBeenCalled();
  });

  it("drops a focus request for an unplaced sketch when the viewer cannot write", async () => {
    using _setup = setup();
    useDesignFocusStore.getState().request(threadRef, "sketch-b");
    const full = snapshot(2);
    await using _screen = await mount({ ...full, nodes: full.nodes.slice(0, 1) }, false);

    await vi.waitFor(() =>
      expect(useDesignFocusStore.getState().pending[scopedThreadKey(threadRef)]).toBeUndefined(),
    );
    expect(mocks.placeSketch).not.toHaveBeenCalled();
  });

  it("removes the selected node from the canvas", async () => {
    using _setup = setup();
    await using screen = await mount(snapshot(2));
    const node = await vi.waitUntil(() =>
      screen.container.querySelector<HTMLElement>('.react-flow__node[data-id="node-a"]'),
    );

    await userEvent.click(page.elementLocator(node), { position: { x: 80, y: 200 } });
    await userEvent.click(screen.getByRole("button", { name: "Remove from canvas" }));

    expect(mocks.removeNode).toHaveBeenCalledOnce();
    expect(mocks.removeNode.mock.calls[0]?.[0]).toMatchObject({
      input: { threadId: threadRef.threadId, nodeId: "node-a" },
    });
  });

  it("hides the React Flow attribution", async () => {
    using _setup = setup();
    await using screen = await mount(snapshot(1));

    await expect.element(screen.getByRole("button", { name: "Open sketch Home A" })).toBeVisible();
    expect(screen.container.querySelector(".react-flow__attribution")).toBeNull();
  });

  it("fits every node into the view when no viewport was saved", async () => {
    using _setup = setup();
    await using screen = await mount({ ...snapshot(2), viewport: null });
    const pane = screen.container.querySelector<HTMLElement>(".react-flow")!;

    await vi.waitFor(() => {
      const bounds = pane.getBoundingClientRect();
      const nodes = [...screen.container.querySelectorAll<HTMLElement>(".react-flow__node")];
      expect(nodes).toHaveLength(2);
      for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        expect(rect.left).toBeGreaterThanOrEqual(bounds.left + bounds.width * 0.05);
        expect(rect.right).toBeLessThanOrEqual(bounds.right - bounds.width * 0.05);
      }
      const left = Math.min(...nodes.map((node) => node.getBoundingClientRect().left));
      const right = Math.max(...nodes.map((node) => node.getBoundingClientRect().right));
      expect(right - left).toBeGreaterThan(bounds.width * 0.7);
    });
  });

  it("letters the nodes of a group of variations", async () => {
    using _setup = setup();
    const canvas = snapshot(2);
    await using screen = await mount({
      ...canvas,
      sketches: canvas.sketches.map((sketch) => ({ ...sketch, groupId: "group:1" })) as never,
    });

    const nodes = await vi.waitUntil(() => {
      const found = screen.container.querySelectorAll<HTMLElement>(".react-flow__node");
      return found.length === 2 ? [...found] : null;
    });
    expect(nodes.map((node) => node.textContent?.startsWith("A"))).toEqual([true, false]);
    expect(nodes[1]?.textContent?.startsWith("B")).toBe(true);
  });
});
