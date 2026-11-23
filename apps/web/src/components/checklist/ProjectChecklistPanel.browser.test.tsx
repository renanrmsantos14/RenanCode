import type { ProjectChecklistItem } from "@t3tools/contracts";
import { ProjectChecklistItemId, ProjectId } from "@t3tools/contracts";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { act, render } from "../../../test/render";
import { type ChecklistPrefs, ProjectChecklistView } from "./ProjectChecklistPanel";

const item = (
  id: string,
  title: string,
  parentId: string | null,
  dueDate: string | null,
  position: number,
  done = false,
): ProjectChecklistItem => ({
  id: ProjectChecklistItemId.make(id),
  projectId: ProjectId.make("project:checklist"),
  parentId: parentId === null ? null : ProjectChecklistItemId.make(parentId),
  title,
  done,
  dueDate,
  position,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

const ITEMS = [
  item("m1", "Site", null, null, 0),
  item("i1", "Publish landing", "m1", "2026-11-20", 0),
  item("i2", "Review copy", "m1", null, 1),
  item("i3", "Old invoice", "m1", "2026-10-05", 2),
];

function Harness(props: {
  onUpdate: (input: object) => Promise<boolean>;
  items?: ReadonlyArray<ProjectChecklistItem>;
  onMove?: (id: string, index: number) => void;
  onDelete?: (id: string) => void;
}) {
  const [prefs, setPrefs] = useState<ChecklistPrefs>({ filter: { kind: "all" }, hideDone: false });
  return (
    <ProjectChecklistView
      items={props.items ?? ITEMS}
      canWrite
      today="2026-11-23"
      prefs={prefs}
      onPrefsChange={setPrefs}
      onUpdate={props.onUpdate}
      onMove={props.onMove ?? vi.fn()}
      onDelete={props.onDelete ?? vi.fn()}
    />
  );
}

describe("ProjectChecklistView", () => {
  it("moves a module above the one before it with the keyboard", async () => {
    const onMove = vi.fn();
    const items = [
      item("m1", "Site", null, null, 0),
      item("i1", "Publish landing", "m1", null, 0),
      item("i2", "Review copy", "m1", null, 1),
      item("m2", "Ads", null, null, 1),
    ];
    await using screen = await render(
      <Harness onUpdate={vi.fn(() => Promise.resolve(true))} items={items} onMove={onMove} />,
    );

    const handle = screen.getByRole("button", { name: "Reorder Ads" });
    handle.element().focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard(" ");

    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith("m2", 0));
  });

  it("moves a module above the one before it with the mouse", async () => {
    const onMove = vi.fn();
    const items = [
      item("m1", "Site", null, null, 0),
      item("i1", "Publish landing", "m1", null, 0),
      item("i2", "Review copy", "m1", null, 1),
      item("m2", "Ads", null, null, 1),
    ];
    await using screen = await render(
      <Harness onUpdate={vi.fn(() => Promise.resolve(true))} items={items} onMove={onMove} />,
    );

    const handle = screen.getByRole("button", { name: "Reorder Ads" }).element();
    const target = screen.getByRole("button", { name: "Reorder Site" }).element();
    const from = handle.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const pointer = (type: string, y: number) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: from.x + 4,
        clientY: y,
      });
    await act(() => {
      handle.dispatchEvent(pointer("pointerdown", from.y + 4));
      document.dispatchEvent(pointer("pointermove", from.y - 4));
    });
    for (let y = from.y - 12; y >= to.y - 4; y -= 8) {
      await act(() => document.dispatchEvent(pointer("pointermove", y)));
    }
    await act(() => document.dispatchEvent(pointer("pointerup", to.y - 4)));

    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith("m2", 0));
  });

  it("asks the server to check an item without ticking it locally", async () => {
    const onUpdate = vi.fn(() => Promise.resolve(false));
    await using screen = await render(<Harness onUpdate={onUpdate} />);

    const box = screen.getByRole("checkbox", { name: "Mark Publish landing as done" });
    await userEvent.click(box);

    expect(onUpdate).toHaveBeenCalledWith({ id: "i1", done: true });
    await expect.element(box).not.toBeChecked();
  });

  it("keeps an overdue open item visible, in red, under the current-month filter", async () => {
    await using screen = await render(<Harness onUpdate={vi.fn(() => Promise.resolve(true))} />);

    await userEvent.click(screen.getByRole("button", { name: "This month" }));

    await expect.element(page.getByText("Publish landing")).toBeVisible();
    await expect.element(page.getByText("Old invoice")).toBeVisible();
    expect(page.getByText("Old invoice").element().className).toContain("text-destructive");
    expect(page.getByText("Review copy").query()).toBeNull();
  });

  it("shows only items inside the range, plus overdue ones in red", async () => {
    const items = [
      ...ITEMS,
      item("i5", "Inside range", "m1", "2026-11-28", 3),
      item("i6", "Past range", "m1", "2026-12-15", 4),
    ];
    await using screen = await render(
      <Harness items={items} onUpdate={vi.fn(() => Promise.resolve(true))} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Range" }));
    await userEvent.fill(screen.getByLabelText("From"), "2026-11-25");
    await userEvent.fill(screen.getByLabelText("To"), "2026-11-30");

    await expect.element(page.getByText("Inside range")).toBeVisible();
    await expect.element(page.getByText("Old invoice")).toBeVisible();
    expect(page.getByText("Old invoice").element().className).toContain("text-destructive");
    expect(page.getByText("Publish landing").element().className).toContain("text-destructive");
    expect(page.getByText("Past range").query()).toBeNull();
    expect(page.getByText("Review copy").query()).toBeNull();
  });

  it("hides and restores completed items without losing them", async () => {
    const items = [...ITEMS.slice(0, 2), item("i4", "Shipped", "m1", null, 1, true)];
    await using screen = await render(
      <Harness items={items} onUpdate={vi.fn(() => Promise.resolve(true))} />,
    );
    await expect.element(page.getByText("Shipped")).toBeVisible();
    expect(page.getByText("Shipped").element().className).toContain("line-through");

    await userEvent.click(screen.getByRole("button", { name: "Hide completed" }));
    expect(page.getByText("Shipped").query()).toBeNull();
    await expect.element(page.getByText("Publish landing")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Hide completed" }));
    await expect.element(page.getByText("Shipped")).toBeVisible();
  });

  it("confirms before deleting a module, counting items hidden by the filter", async () => {
    const onDelete = vi.fn();
    await using screen = await render(
      <Harness onDelete={onDelete} onUpdate={vi.fn(() => Promise.resolve(true))} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "This month" }));

    await userEvent.hover(page.getByText("Site", { exact: true }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Site" }));
    expect(onDelete).not.toHaveBeenCalled();
    await expect.element(page.getByText("Delete Site and 3 items?")).toBeVisible();

    await userEvent.click(page.getByRole("button", { name: "Delete", exact: true }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("m1");
  });

  it("deletes an item or an empty module without asking", async () => {
    const onDelete = vi.fn();
    const items = [...ITEMS, item("m2", "Empty", null, null, 1)];
    await using screen = await render(
      <Harness items={items} onDelete={onDelete} onUpdate={vi.fn(() => Promise.resolve(true))} />,
    );
    await userEvent.hover(page.getByText("Empty", { exact: true }));
    await userEvent.click(screen.getByRole("button", { name: "Delete Empty" }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("m2");
  });

  it("reorders an item with the keyboard using the real sibling index", async () => {
    const onMove = vi.fn();
    await using screen = await render(
      <Harness onMove={onMove} onUpdate={vi.fn(() => Promise.resolve(true))} />,
    );
    screen.getByRole("button", { name: "Reorder Publish landing" }).element().focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ }");

    await vi.waitFor(() => expect(onMove).toHaveBeenCalledWith("i1", 1));
  });
});
