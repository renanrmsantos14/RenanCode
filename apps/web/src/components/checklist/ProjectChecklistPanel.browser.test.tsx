import type { ProjectChecklistItem } from "@t3tools/contracts";
import { ProjectChecklistItemId, ProjectId } from "@t3tools/contracts";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
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

function Harness(props: { onUpdate: (input: object) => Promise<boolean> }) {
  const [prefs, setPrefs] = useState<ChecklistPrefs>({ filter: { kind: "all" }, hideDone: false });
  return (
    <ProjectChecklistView
      items={ITEMS}
      canWrite
      today="2026-11-23"
      prefs={prefs}
      onPrefsChange={setPrefs}
      onUpdate={props.onUpdate}
      onMove={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

describe("ProjectChecklistView", () => {
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
});
