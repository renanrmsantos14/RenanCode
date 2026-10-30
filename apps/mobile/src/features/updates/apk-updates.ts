import * as Application from "expo-application";
import Constants from "expo-constants";
import { File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { AppState, Platform } from "react-native";

import * as Dialog from "../../components/ui/Dialog";
import { type ApkRelease, pickNewerApkRelease } from "./apk-release";
import type { AppUpdateCheckState } from "./app-updates";

const FOREGROUND_RECHECK_AFTER_MS = 15 * 60 * 1000;
const FLAG_GRANT_READ_URI_PERMISSION = 1;

const apkUpdateRepo = Constants.expoConfig?.extra?.apkUpdateRepo as string | null | undefined;
let checkInFlight = false;
// Automatic checks stop asking about a version the user postponed this session.
let postponedVersionCode = 0;

export function isApkUpdateAvailable(): boolean {
  return Platform.OS === "android" && typeof apkUpdateRepo === "string";
}

/** Checks GitHub for a newer APK and offers to install it; interactive checks also report "up to date" and errors. */
export async function runApkUpdateCheck({
  interactive,
  onStateChange,
}: {
  readonly interactive: boolean;
  readonly onStateChange?: (state: AppUpdateCheckState) => void;
}): Promise<void> {
  if (!isApkUpdateAvailable() || checkInFlight) return;
  checkInFlight = true;
  onStateChange?.("checking");
  try {
    const response = await fetch(`https://api.github.com/repos/${apkUpdateRepo}/releases`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
    const release = pickNewerApkRelease(
      await response.json(),
      Number(Application.nativeBuildVersion ?? 0),
    );
    if (!release || (!interactive && release.versionCode <= postponedVersionCode)) {
      onStateChange?.(release ? "idle" : "current");
      return;
    }
    onStateChange?.("ready");
    Dialog.confirm({
      title: "Update available",
      message: `Version ${release.version} is ready to install.`,
      cancelText: "Later",
      confirmText: "Update",
      onCancel: () => {
        postponedVersionCode = release.versionCode;
        onStateChange?.("idle");
      },
      onConfirm: () => void installApk(release, onStateChange),
    });
  } catch (error) {
    onStateChange?.("idle");
    if (interactive) Dialog.alert("Update failed", errorMessage(error));
  } finally {
    checkInFlight = false;
  }
}

async function installApk(
  release: ApkRelease,
  onStateChange: ((state: AppUpdateCheckState) => void) | undefined,
): Promise<void> {
  onStateChange?.("downloading");
  try {
    const file = await File.downloadFileAsync(
      release.apkUrl,
      new File(Paths.cache, `RenanCode-${release.version}.apk`),
      { idempotent: true },
    );
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: await getContentUriAsync(file.uri),
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      type: "application/vnd.android.package-archive",
    });
    onStateChange?.("idle");
  } catch (error) {
    onStateChange?.("idle");
    Dialog.alert("Update failed", errorMessage(error));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Checks at launch and when the app returns after a long stay in the background. */
export function installApkUpdateChecks(): () => void {
  if (!isApkUpdateAvailable()) return () => undefined;
  void runApkUpdateCheck({ interactive: false });
  let backgroundedAtMs: number | null = null;
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "background") {
      backgroundedAtMs = Date.now();
      return;
    }
    if (state !== "active") return;
    const shouldCheck =
      backgroundedAtMs !== null && Date.now() - backgroundedAtMs >= FOREGROUND_RECHECK_AFTER_MS;
    backgroundedAtMs = null;
    if (shouldCheck) void runApkUpdateCheck({ interactive: false });
  });
  return () => subscription.remove();
}
