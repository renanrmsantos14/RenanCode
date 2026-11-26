import { useState } from "react";
import { expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import { ComposerDesignToggle } from "./ComposerFooterControls";

function Harness() {
  const [mode, setMode] = useState<"default" | "design">("default");
  return (
    <>
      <ComposerDesignToggle
        pressed={mode === "design"}
        onPressedChange={(on) => setMode(on ? "design" : "default")}
      />
      <CompactComposerControlsMenu
        runtimeMode="full-access"
        runtimeModeOptions={[]}
        showPermissions={false}
        designMode={mode === "design"}
        onDesignModeChange={(on) => setMode(on ? "design" : "default")}
        onRuntimeModeChange={() => undefined}
      />
      <p role="status">{mode}</p>
    </>
  );
}

it("turns Design mode on and off from the footer toggle", async () => {
  await using screen = await render(<Harness />, { router: false });
  const toggle = screen.getByRole("button", { name: "Design mode" });
  const status = screen.getByRole("status");

  await expect.element(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect.element(status).toHaveTextContent("design");
  await expect.element(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect.element(status).toHaveTextContent("default");
});

it("checks Design mode from the compact menu", async () => {
  await using screen = await render(<Harness />, { router: false });
  await screen.getByRole("button", { name: "More composer controls" }).click();
  await screen.getByRole("menuitemcheckbox", { name: "Design mode" }).click();
  await expect.element(screen.getByRole("status")).toHaveTextContent("design");
});
