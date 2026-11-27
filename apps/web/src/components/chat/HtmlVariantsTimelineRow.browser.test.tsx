import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { HtmlVariantsGrid } from "./HtmlVariantsTimelineRow";

const variants = [
  { attachmentId: "t-1-html", title: "Home", height: 300, label: "Dense" },
  { attachmentId: "t-2-html", title: "Home", height: 300, label: "Airy" },
];

describe("HtmlVariantsGrid", () => {
  it("picks a variant, then hands the choice to the composer only when it can take it", async () => {
    const onFollow = vi.fn(() => true);
    await using screen = await render(
      <HtmlVariantsGrid variants={variants} renderVariant={() => <div />} onFollow={onFollow} />,
    );

    await expect.element(screen.getByRole("button", { name: "Choose" })).toBeDisabled();
    await userEvent.click(screen.getByText("B · Airy"));
    await userEvent.click(screen.getByRole("button", { name: "Choose B" }));
    expect(onFollow).toHaveBeenCalledWith("I chose B (Airy): ");

    await screen.rerender(<HtmlVariantsGrid variants={variants} renderVariant={() => <div />} />);
    await expect.element(screen.getByRole("button", { name: "Choose B" })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("radio")).not.toBeInTheDocument();
  });
});

describe("HtmlVariantsGrid open button", () => {
  it("opens the viewer on the option whose button was clicked", async () => {
    const onOpen = vi.fn();
    await using screen = await render(
      <HtmlVariantsGrid variants={variants} renderVariant={() => <div />} onOpen={onOpen} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open Airy" }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });
  it("keeps five options reachable from the scrolling strip", async () => {
    const many = Array.from({ length: 6 }, (_, index) => ({
      attachmentId: `t-${index}-html`,
      title: "Home",
      height: 300,
      label: `Option ${index}`,
    }));
    await using screen = await render(
      <HtmlVariantsGrid variants={many} renderVariant={() => <div />} onFollow={() => true} />,
    );
    await expect.element(screen.getByText("F · Option 5")).toBeInTheDocument();
  });
});
