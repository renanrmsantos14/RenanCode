import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Electron from "electron";

import * as DesktopAssets from "../app/DesktopAssets.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopWindow from "./DesktopWindow.ts";

// Windows only: closing the main window hides it (DesktopWindow), so the tray is the way back and out.
export const install = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  if (environment.platform !== "win32") return;
  const { ico } = yield* (yield* DesktopAssets.DesktopAssets).iconPaths;
  if (Option.isNone(ico)) {
    yield* Effect.logWarning("tray icon not found; skipping tray");
    return;
  }
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  const electronApp = yield* ElectronApp.ElectronApp;
  const runFork = Effect.runForkWith(
    yield* Effect.context<DesktopWindow.DesktopWindow | ElectronApp.ElectronApp>(),
  );
  const open = () => runFork(desktopWindow.activate.pipe(Effect.ignoreCause));
  const name = environment.displayName;

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const tray = new Electron.Tray(ico.value);
      tray.setToolTip(name);
      tray.setContextMenu(
        Electron.Menu.buildFromTemplate([
          { label: `Open ${name}`, click: open },
          { type: "separator" },
          { label: `Quit ${name}`, click: () => runFork(electronApp.quit) },
        ]),
      );
      tray.on("click", open);
      return tray;
    }),
    (tray) => Effect.sync(() => tray.destroy()),
  );
}).pipe(Effect.withSpan("desktop.tray.install"));
