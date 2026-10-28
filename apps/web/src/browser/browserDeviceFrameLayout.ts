import type { PreviewViewportPresetId, PreviewViewportSetting } from "@t3tools/contracts";
import { PREVIEW_VIEWPORT_PRESETS } from "@t3tools/shared/previewViewport";
import { Schema } from "effect";

import { useLocalStorage } from "~/hooks/useLocalStorage";

export type BrowserDeviceCamera = "island" | "notch" | "punch-hole";

export interface BrowserDeviceFrame {
  readonly kind: "phone" | "tablet";
  /** Bezel thickness in device CSS pixels. */
  readonly bezel: number;
  readonly screenRadius: number;
  readonly camera: BrowserDeviceCamera | null;
}

/** Room around the bezel for side buttons and the drop shadow, in device CSS pixels. */
const FRAME_MARGIN = 16;

const SCREENS: Partial<
  Record<
    PreviewViewportPresetId,
    { readonly screenRadius: number; readonly camera: BrowserDeviceCamera | null }
  >
> = {
  "iphone-se": { screenRadius: 4, camera: null },
  "iphone-xr": { screenRadius: 40, camera: "notch" },
  "iphone-12-pro": { screenRadius: 44, camera: "notch" },
  "iphone-14-pro-max": { screenRadius: 52, camera: "island" },
  "pixel-7": { screenRadius: 26, camera: "punch-hole" },
  "samsung-galaxy-s8-plus": { screenRadius: 24, camera: "punch-hole" },
  "samsung-galaxy-s20-ultra": { screenRadius: 24, camera: "punch-hole" },
  "samsung-galaxy-a51-71": { screenRadius: 24, camera: "punch-hole" },
  "galaxy-z-fold-5": { screenRadius: 16, camera: "punch-hole" },
  "surface-duo": { screenRadius: 6, camera: null },
  "surface-pro-7": { screenRadius: 6, camera: null },
  "asus-zenbook-fold": { screenRadius: 8, camera: null },
};

export function resolveBrowserDeviceFrame(
  setting: PreviewViewportSetting,
): BrowserDeviceFrame | null {
  if (setting._tag !== "preset") return null;
  const preset = PREVIEW_VIEWPORT_PRESETS.find((candidate) => candidate.id === setting.presetId);
  if (!preset || preset.category === "Desktop") return null;
  const phone = preset.category === "Phone";
  return {
    kind: phone ? "phone" : "tablet",
    bezel: phone ? 12 : 18,
    ...(SCREENS[preset.id] ?? { screenRadius: phone ? 24 : 18, camera: null }),
  };
}

/** Device CSS pixels the layout reserves on each side of the screen for the frame. */
export const browserDeviceFrameInset = (frame: BrowserDeviceFrame | null): number =>
  frame ? frame.bezel + FRAME_MARGIN : 0;

const DEVICE_FRAME_STORAGE_KEY = "t3code.browserDeviceFrame";

export const useBrowserDeviceFrameEnabled = () =>
  useLocalStorage(DEVICE_FRAME_STORAGE_KEY, true, Schema.Boolean);
