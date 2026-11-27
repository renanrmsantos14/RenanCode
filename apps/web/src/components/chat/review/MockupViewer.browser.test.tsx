import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../../test/render";
import { MockupViewer } from "./MockupViewer";
import { useMockupViewer } from "./useMockupViewer";

const variants = ["Dense", "Airy", "Bold", "Calm", "Loud", "Quiet"].map((label, index) => ({
  attachmentId: `t-${index}-html`,
  title: "Home",
  height: 300,
  label,
}));

function Harness(props: { readonly onChoose?: (text: string) => boolean }) {
  const viewer = useMockupViewer({ scope: "thread-a" });
  const [composer, setComposer] = useState("");
  return (
    <div>
      <button type="button" onClick={() => viewer.open("row-1", variants, 0)}>
        open
      </button>
      <textarea
        aria-label="composer"
        value={composer}
        onChange={(e) => setComposer(e.target.value)}
      />
      {viewer.active ? (
        <MockupViewer
          viewer={viewer}
          onChoose={(text) => {
            props.onChoose?.(text);
            setComposer(text);
            return true;
          }}
          renderPage={(variant) => <iframe title={variant.label} sandbox="" />}
        />
      ) : null}
    </div>
  );
}

describe("MockupViewer", () => {
  it("opens, switches by selector and arrows, and mounts one page at a time", async () => {
    await using screen = await render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await expect.element(screen.getByText("A · Dense")).toBeInTheDocument();
    expect(document.querySelectorAll("iframe")).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "Show Airy" }).first());
    await expect.element(screen.getByText("B · Airy")).toBeInTheDocument();
    expect(document.querySelectorAll("iframe")).toHaveLength(1);

    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByText("C · Bold")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await expect.element(screen.getByText("A · Dense")).toBeInTheDocument();
    expect(document.querySelectorAll("iframe")).toHaveLength(1);
  });

  it("ignores arrows typed in the composer and fills it on choose without sending", async () => {
    const onChoose = vi.fn();
    await using screen = await render(<Harness onChoose={onChoose} />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await userEvent.click(screen.getByRole("textbox", { name: "composer" }));
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByText("A · Dense")).toBeInTheDocument();

    (document.activeElement as HTMLElement).blur();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(screen.getByRole("button", { name: "Choose B" }));
    expect(onChoose).toHaveBeenCalledWith("I chose B (Airy): ");
    await expect
      .element(screen.getByRole("textbox", { name: "composer" }))
      .toHaveValue("I chose B (Airy): ");
  });

  it("closes on Escape", async () => {
    await using screen = await render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByText("A · Dense")).not.toBeInTheDocument();
  });
});
