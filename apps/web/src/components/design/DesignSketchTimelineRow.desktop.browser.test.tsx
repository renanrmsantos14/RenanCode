import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { DesignSketchReference } from "@t3tools/shared/design";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";

const mocks = vi.hoisted(() => ({ placeSketch: vi.fn() }));

vi.mock("~/env", () => ({ isElectron: true }));
vi.mock(import("~/state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => mocks.placeSketch) as never,
}));
vi.mock(import("./sketchAssets"), () => ({
  useSketchPageUrl: () => "about:blank",
  useSketchThumbnailUrl: () => null,
}));

import { useRightPanelStore } from "~/rightPanelStore";
import { TimelineRowCtx, type TimelineRow } from "../chat/timelineRowContext";
import { useDesignFocusStore } from "./designFocusStore";
import { DesignSketchTimelineRow } from "./DesignSketchTimelineRow";

const environmentId = EnvironmentId.make("environment");
const threadRef = { environmentId, threadId: ThreadId.make("thread") };

const sketch = (id: string, label?: string): DesignSketchReference => ({
  sketchId: id,
  attachmentId: `${id}.html`,
  thumbnailAttachmentId: null,
  title: `Home ${id}`,
  width: 390,
  height: 844,
  ...(label === undefined ? {} : { label }),
});

// The shared stores and the mocked command outlive a test, so each one starts by resetting them.
function setup(options: { placed?: "Success" | "Failure" } = {}) {
  mocks.placeSketch.mockReset().mockResolvedValue({ _tag: options.placed ?? "Success" });
  useDesignFocusStore.setState({ pending: {} });
  useRightPanelStore.setState({ byThreadKey: {} });
  return {
    [Symbol.dispose]: () => {
      useDesignFocusStore.setState({ pending: {} });
      useRightPanelStore.setState({ byThreadKey: {} });
    },
  };
}

function mount(sketches: ReadonlyArray<DesignSketchReference>) {
  const row = {
    kind: "design-sketches",
    id: "row",
    createdAt: "2026-01-01T00:00:00.000Z",
    designSketches: sketches,
  } as unknown as Extract<TimelineRow, { kind: "design-sketches" }>;
  return render(
    <TimelineRowCtx value={{ activeThreadEnvironmentId: environmentId, threadRef } as never}>
      <DesignSketchTimelineRow row={row} />
    </TimelineRowCtx>,
  );
}

describe("DesignSketchTimelineRow on desktop", () => {
  it("opens the Design surface and focuses the sketch on desktop", async () => {
    using _setup = setup();
    await using screen = await mount([sketch("a")]);

    await userEvent.click(screen.getByRole("button", { name: "Open sketch Home a" }));

    expect(mocks.placeSketch).toHaveBeenCalledOnce();
    expect(mocks.placeSketch.mock.calls[0]?.[0]).toMatchObject({
      environmentId,
      input: { threadId: threadRef.threadId, sketchId: "a" },
    });
    expect(useDesignFocusStore.getState().pending[scopedThreadKey(threadRef)]).toBe("a");
    const panel = useRightPanelStore.getState().byThreadKey[scopedThreadKey(threadRef)];
    expect(panel?.isOpen).toBe(true);
    expect(panel?.activeSurfaceId).toBe("design");
  });

  it("falls back to the viewer on desktop when the sketch cannot be placed", async () => {
    using _setup = setup({ placed: "Failure" });
    await using screen = await mount([sketch("a")]);

    await userEvent.click(screen.getByRole("button", { name: "Open sketch Home a" }));

    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(useDesignFocusStore.getState().pending).toEqual({});
  });
});
