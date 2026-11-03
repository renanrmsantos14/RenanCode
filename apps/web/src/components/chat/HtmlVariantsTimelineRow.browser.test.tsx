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
  it("offers a follow-up per variant only when the composer can take it", async () => {
    const onFollow = vi.fn(() => true);
    await using screen = await render(
      <HtmlVariantsGrid variants={variants} renderVariant={() => <div />} onFollow={onFollow} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Use B" }));
    expect(onFollow).toHaveBeenCalledWith("Continue with variant B (Airy): ");

    await screen.rerender(<HtmlVariantsGrid variants={variants} renderVariant={() => <div />} />);
    await expect.element(screen.getByRole("button", { name: "Use B" })).not.toBeInTheDocument();
  });
});
