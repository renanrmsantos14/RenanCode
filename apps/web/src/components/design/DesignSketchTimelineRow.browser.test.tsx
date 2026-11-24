import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { DesignSketchReference } from "@t3tools/shared/design";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";

const mocks = vi.hoisted(() => ({ placeSketch: vi.fn() }));
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

// The mocked command and the panel store outlive a test, so each one starts by resetting them.
function setup() {
  mocks.placeSketch.mockReset();
  useRightPanelStore.setState({ byThreadKey: {} });
  return { [Symbol.dispose]: () => useRightPanelStore.setState({ byThreadKey: {} }) };
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

describe("DesignSketchTimelineRow on the web", () => {
  it("opens the full-screen viewer outside the desktop app", async () => {
    using _setup = setup();
    await using screen = await mount([sketch("a")]);

    await userEvent.click(screen.getByRole("button", { name: "Open sketch Home a" }));

    expect(mocks.placeSketch).not.toHaveBeenCalled();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    expect(useRightPanelStore.getState().byThreadKey).toEqual({});
  });

  it("lays out variations as lettered cards and the viewer switches between them", async () => {
    using _setup = setup();
    await using screen = await mount([
      sketch("a", "Dense"),
      sketch("b", "Airy"),
      sketch("c", "Bold"),
    ]);

    await expect.element(screen.getByRole("button", { name: /Open sketch/ }).first()).toBeVisible();
    expect(screen.container.querySelectorAll("button")).toHaveLength(3);

    await userEvent.click(screen.getByRole("button", { name: "Open sketch Home b" }));

    const tabs = page.getByRole("button", { name: /Show [ABC]/ });
    await expect.element(tabs.first()).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Show B" }))
      .toHaveAttribute("aria-pressed", "true");
    await userEvent.click(page.getByRole("button", { name: "Show C" }));
    await expect
      .element(page.getByRole("button", { name: "Show C" }))
      .toHaveAttribute("aria-pressed", "true");
  });
});
