import { use, useState } from "react";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../../test/render";
import { AppAtomRegistryProvider } from "../../../rpc/atomRegistry";
import { ReviewRootHost } from "./ReviewRootHost";
import { MediaReviewContext } from "./useReviewMode";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function Page() {
  const openMedia = use(MediaReviewContext);
  const [pathname, setPathname] = useState("/pull-requests");
  return (
    <>
      <button
        type="button"
        onClick={() => openMedia({ images: [{ src: PIXEL, name: "shot.png" }], index: 0 })}
      >
        Open media
      </button>
      <button type="button" onClick={() => setPathname("/issues")}>
        Go to issues
      </button>
      <ReviewRootHost pathname={pathname} />
    </>
  );
}

describe("ReviewRootHost", () => {
  it("shows media opened outside a thread full screen, without the chat button", async () => {
    await page.viewport(1000, 700);
    await using screen = await render(
      <AppAtomRegistryProvider>
        <Page />
      </AppAtomRegistryProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open media" }));
    const region = screen.getByRole("region", { name: "Media review" });
    await expect.element(region).toBeVisible();
    await expect.element(screen.getByText("shot.png")).toBeVisible();
    expect(screen.getByRole("button", { name: /chat$/ }).elements()).toHaveLength(0);

    await userEvent.keyboard("{Escape}");
    await expect.element(region).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Open media" }));
    await expect.element(region).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Close media review" }));
    await expect.element(region).not.toBeInTheDocument();
  });

  it("closes when the page changes", async () => {
    await page.viewport(1000, 700);
    await using screen = await render(
      <AppAtomRegistryProvider>
        <Page />
      </AppAtomRegistryProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Open media" }));
    const region = screen.getByRole("region", { name: "Media review" });
    await expect.element(region).toBeVisible();
    // The review covers the page, so the route change comes from outside it.
    screen
      .getByRole("button", { name: "Go to issues" })
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await expect.element(region).not.toBeInTheDocument();
  });
});
