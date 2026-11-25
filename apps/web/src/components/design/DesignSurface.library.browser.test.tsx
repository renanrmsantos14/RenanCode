import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  type DesignProjectSketch,
  DesignSketchId,
  EnvironmentId,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { AsyncResult } from "effect/reactivity";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";

const mocks = vi.hoisted(() => ({ placeSketch: vi.fn(), listProjectSketches: vi.fn() }));

vi.mock(import("~/state/design"), () => ({
  designEnvironment: {
    canvas: () => canvasAtom,
    moveNodes: { permissionAtom: () => granted },
    placeSketch: "placeSketch",
    listProjectSketches: "listProjectSketches",
  } as never,
}));
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: ((command: "placeSketch" | "listProjectSketches") => mocks[command]) as never,
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useThreadShell: (() => ({ projectId: "project" })) as never,
}));
vi.mock(import("../preview/previewBridge"), () => ({ previewBridge: {} as never }));
vi.mock(import("./useAutoDesignFrame"), () => ({ useAutoDesignFrame: () => undefined }));
vi.mock(import("./sketchAssets"), () => ({
  useSketchPageUrl: () => "about:blank",
  useSketchThumbnailUrl: () => null,
}));
vi.mock(import("./DesignCanvas"), () => ({
  DesignCanvas: ((props: { library?: { onToggle: () => void } }) => (
    <button type="button" onClick={props.library?.onToggle}>
      Project sketches
    </button>
  )) as never,
}));

import { useRightPanelStore } from "~/rightPanelStore";
import { useDesignFocusStore } from "./designFocusStore";
import DesignSurface from "./DesignSurface";
import { DESIGN_SKETCH_DRAG_TYPE } from "./projectSketchLibrary";

const environmentId = EnvironmentId.make("environment");
const threadRef = { environmentId, threadId: ThreadId.make("thread") };
const granted = Atom.make(true);
const canvasAtom = Atom.make(
  AsyncResult.success({ threadId: threadRef.threadId, viewport: null, nodes: [], sketches: [] }),
) as never;

const sketch = (
  id: string,
  thread: string,
  title: string,
  deleted = false,
): DesignProjectSketch => ({
  id: DesignSketchId.make(id),
  projectId: ProjectId.make("project"),
  originThreadId: ThreadId.make(thread),
  groupId: null,
  basedOnSketchId: null,
  title,
  label: null,
  htmlAttachmentId: `${id}.html`,
  thumbnailAttachmentId: null,
  width: 390,
  height: 844,
  createdAt: "2026-11-25T12:00:00.000Z",
  originThreadTitle: deleted ? null : `Thread ${thread}`,
  originThreadDeleted: deleted,
});

const LIBRARY = [
  sketch("home", "one", "Home"),
  sketch("checkout", "one", "Checkout"),
  sketch("old-login", "gone", "Old login", true),
];

// The mocked commands and the shared stores outlive a test, so each one starts by resetting them.
function setup() {
  mocks.placeSketch.mockReset().mockResolvedValue({ _tag: "Success" });
  mocks.listProjectSketches.mockReset().mockImplementation(async ({ input }) => ({
    _tag: "Success",
    value: {
      sketches: LIBRARY.filter(
        (entry) =>
          input.query === undefined ||
          entry.title.toLowerCase().includes(input.query.toLowerCase()),
      ),
      nextCursor: null,
    },
  }));
  useDesignFocusStore.setState({ pending: {} });
  useRightPanelStore.setState({ byThreadKey: {} });
  return {
    [Symbol.dispose]: () => {
      useDesignFocusStore.setState({ pending: {} });
      useRightPanelStore.setState({ byThreadKey: {} });
    },
  };
}

const mount = () => render(<DesignSurface environmentId={environmentId} threadRef={threadRef} />);

async function openLibrary() {
  await userEvent.click(page.getByRole("button", { name: "Project sketches" }));
  await expect.element(page.getByRole("complementary", { name: "Project sketches" })).toBeVisible();
}

describe("Project sketch library", () => {
  it("lists the project's sketches by origin thread, deleted threads included", async () => {
    using _setup = setup();
    await using _screen = await mount();
    await openLibrary();

    await expect.element(page.getByRole("heading", { name: "Thread one" })).toBeVisible();
    await expect.element(page.getByRole("heading", { name: "Deleted thread" })).toBeVisible();
    await expect.element(page.getByText("Old login")).toBeVisible();
    await expect.element(page.getByText("Checkout")).toBeVisible();
  });

  it("searches by title", async () => {
    using _setup = setup();
    await using _screen = await mount();
    await openLibrary();

    await userEvent.fill(page.getByRole("searchbox", { name: "Search sketches" }), "check");

    await expect.element(page.getByText("Checkout")).toBeVisible();
    await expect.element(page.getByText("Old login")).not.toBeInTheDocument();
    expect(mocks.listProjectSketches).toHaveBeenLastCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ query: "check" }) }),
    );
  });

  it("places a sketch dropped on the canvas and focuses it", async () => {
    using _setup = setup();
    await using screen = await mount();
    await openLibrary();
    await expect.element(page.getByText("Old login")).toBeVisible();
    const item = screen.container.querySelector("[data-design-library-item='old-login']")!;
    const data = new DataTransfer();
    item.dispatchEvent(new DragEvent("dragstart", { dataTransfer: data, bubbles: true }));
    expect(data.getData(DESIGN_SKETCH_DRAG_TYPE)).toBe("old-login");

    const zone = screen.container.querySelector("[data-design-surface] > div")!;
    zone.dispatchEvent(
      new DragEvent("dragover", { dataTransfer: data, bubbles: true, cancelable: true }),
    );
    zone.dispatchEvent(
      new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => expect(mocks.placeSketch).toHaveBeenCalledOnce());
    expect(mocks.placeSketch.mock.calls[0]?.[0]).toMatchObject({
      environmentId,
      input: { threadId: threadRef.threadId, sketchId: "old-login" },
    });
    await vi.waitFor(() =>
      expect(useDesignFocusStore.getState().pending[scopedThreadKey(threadRef)]).toBe("old-login"),
    );
  });

  it("places a sketch with its add button", async () => {
    using _setup = setup();
    await using _screen = await mount();
    await openLibrary();

    await userEvent.click(page.getByRole("button", { name: "Add sketch Home to the canvas" }));

    await vi.waitFor(() => expect(mocks.placeSketch).toHaveBeenCalledOnce());
  });
});
