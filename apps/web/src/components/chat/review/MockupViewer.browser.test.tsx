import { use, useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../../test/render";
import { AppAtomRegistryProvider } from "../../../rpc/atomRegistry";
import { MockupViewer } from "./MockupViewer";
import { ReviewViewer } from "./ReviewViewer";
import { useMockupViewer } from "./useMockupViewer";
import { MediaReviewContext, useReviewMode, useThreadOpenMedia } from "./useReviewMode";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const SCOPE = "thread-a";
const SOURCE = { cwd: undefined, hostImageUrl: null };

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

function PageWithImage(props: { readonly label: string }) {
  const openMedia = use(MediaReviewContext);
  return (
    <>
      <iframe title={props.label} sandbox="" />
      <button
        type="button"
        onClick={() => openMedia({ images: [{ src: PIXEL, name: "shot.png" }], index: 0 })}
      >
        Open page image
      </button>
    </>
  );
}

// Mirrors ChatView: the page's media opens review in the viewer's place, without closing it.
function ReviewHarness() {
  const viewer = useMockupViewer({ scope: SCOPE });
  const review = useReviewMode(SCOPE);
  const openMedia = useThreadOpenMedia({ scope: SCOPE, entries: [], source: SOURCE });
  return (
    <div className="flex h-[600px] w-[900px]">
      <button type="button" onClick={() => viewer.open("row-1", variants, 0)}>
        open
      </button>
      {review.active ? (
        <ReviewViewer
          review={review}
          scope={SCOPE}
          entries={[]}
          source={{ ...SOURCE, threadRef: null }}
        />
      ) : null}
      {viewer.active ? (
        <MediaReviewContext value={openMedia}>
          <MockupViewer
            viewer={viewer}
            covered={review.active}
            renderPage={(variant) => <PageWithImage label={variant.label} />}
          />
        </MediaReviewContext>
      ) : null}
    </div>
  );
}

describe("MockupViewer", () => {
  it("opens a page's image in review over the viewer and shows the same page again on close", async () => {
    await using screen = await render(
      <AppAtomRegistryProvider>
        <ReviewHarness />
      </AppAtomRegistryProvider>,
      { router: false },
    );
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    const frame = document.querySelector("iframe");
    await userEvent.click(screen.getByRole("button", { name: "Open page image" }));

    await expect.element(page.getByRole("region", { name: "Media review" })).toBeVisible();
    expect(frame?.checkVisibility()).toBe(false);
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(page.getByRole("button", { name: "Close media review" }));

    await expect
      .element(page.getByRole("region", { name: "Media review" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("A · Dense")).toBeVisible();
    expect(document.querySelector("iframe")).toBe(frame);
  });

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

  it("takes focus from the control that opened it so the arrows work", async () => {
    await using screen = await render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await expect.element(screen.getByRole("region", { name: "Mockup viewer" })).toHaveFocus();
  });

  it("closes on Escape", async () => {
    await using screen = await render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    await userEvent.keyboard("{Escape}");
    await expect.element(screen.getByText("A · Dense")).not.toBeInTheDocument();
  });
});
