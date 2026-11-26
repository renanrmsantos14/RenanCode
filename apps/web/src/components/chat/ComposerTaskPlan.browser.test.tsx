import { describe, expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { ComposerTaskPlan } from "./ComposerTaskPlan";

import "~/index.css";

describe("ComposerTaskPlan", () => {
  it("shows the current step and progress, and expands to every step", async () => {
    await using screen = await render(
      <div style={{ width: 480 }}>
        <ComposerTaskPlan
          steps={[
            { id: "step-0", text: "Read the code", status: "completed" },
            { id: "step-1", text: "Write the reducer", status: "running" },
            { id: "step-2", text: "Show the screenshot", status: "pending" },
          ]}
          live
        />
      </div>,
    );

    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle.element().querySelector("[class*=animate-spin]")).not.toBeNull();
    await expect.element(toggle).toHaveTextContent("Write the reducer1/3");
    expect(screen.getByRole("list", { name: "Task plan" }).query()).toBeNull();

    await toggle.click();
    const list = screen.getByRole("list", { name: "Task plan" });
    await expect.element(list).toBeVisible();
    expect(
      [...list.element().querySelectorAll("li")].map((row) => row.getAttribute("aria-label")),
    ).toEqual([
      "Step 1 of 3: Read the code, done",
      "Step 2 of 3: Write the reducer, in progress",
      "Step 3 of 3: Show the screenshot, pending",
    ]);
  });

  it("collapses to a summary once every step is done", async () => {
    await using screen = await render(
      <ComposerTaskPlan
        steps={[
          { id: "step-0", text: "Read the code", status: "completed" },
          { id: "step-1", text: "Write the reducer", status: "completed" },
        ]}
        live
      />,
    );

    await expect.element(screen.getByRole("button")).toHaveTextContent("Plan complete2/2");
  });

  it("stops spinning a step left running once the turn ends", async () => {
    await using screen = await render(
      <ComposerTaskPlan
        steps={[{ id: "step-0", text: "Write the reducer", status: "running" }]}
        live={false}
      />,
    );

    await expect.element(screen.getByRole("button")).toHaveTextContent("Write the reducer0/1");
    expect(screen.getByRole("button").element().querySelector("[class*=animate-spin]")).toBeNull();
  });
});
