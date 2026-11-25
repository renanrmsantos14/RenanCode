import { describe, expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { TaskPlanCard } from "./TaskPlanCard";

import "~/index.css";

describe("TaskPlanCard", () => {
  it("shows done, running, and pending steps with their state", async () => {
    await using screen = await render(
      <div style={{ width: 480 }}>
        <TaskPlanCard
          steps={[
            { id: "step-0", text: "Read the code", status: "completed" },
            { id: "step-1", text: "Write the reducer", status: "running" },
            { id: "step-2", text: "Show the screenshot", status: "pending" },
          ]}
        />
      </div>,
    );

    const list = screen.getByRole("list", { name: "Task plan" });
    await expect.element(list).toBeVisible();
    const rows = [...list.element().querySelectorAll("li")];
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Step 1 of 3: Read the code, done",
      "Step 2 of 3: Write the reducer, in progress",
      "Step 3 of 3: Show the screenshot, pending",
    ]);
    expect(rows.map((row) => row.getAttribute("aria-live"))).toEqual([null, "polite", null]);
    expect(rows[0]?.querySelector(".line-through")).toHaveTextContent("Read the code");
    expect(rows[1]?.querySelector(".text-foreground")).toHaveTextContent("Write the reducer");
    expect(rows[1]?.querySelector("svg.lucide-loader-circle")).not.toBeNull();
    expect(rows[2]?.querySelector("svg.lucide-circle-dashed")).not.toBeNull();
  });
});
