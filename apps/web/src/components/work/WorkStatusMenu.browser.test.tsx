import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { WorkStatusMenu } from "./WorkStatusMenu";

describe("WorkStatusMenu", () => {
  it("asks for a reason before setting a module to waiting", async () => {
    const onChange = vi.fn();
    await using screen = await render(
      <WorkStatusMenu status="active" waitingReason={null} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Status: Em andamento" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Esperando" }));
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.type(
      page.getByRole("textbox", { name: "Esperando o quê" }),
      "DNS from client{Enter}",
    );
    expect(onChange).toHaveBeenCalledWith({ status: "waiting", waitingReason: "DNS from client" });
  });
});
