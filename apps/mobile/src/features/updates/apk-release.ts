export interface ApkRelease {
  readonly version: string;
  readonly versionCode: number;
  readonly apkUrl: string;
}

// fork-release-android.yml tags android-v<major>.<minor>.<run_number> and uses run_number as versionCode.
const APK_TAG = /^android-v(\d+\.\d+\.(\d+))$/;

/** The newest GitHub release carrying an APK with a higher versionCode than the installed one. */
export function pickNewerApkRelease(
  releases: unknown,
  installedVersionCode: number,
): ApkRelease | null {
  if (!Array.isArray(releases)) return null;
  let newest: ApkRelease | null = null;
  for (const release of releases) {
    if (release?.draft || typeof release?.tag_name !== "string") continue;
    const match = APK_TAG.exec(release.tag_name);
    const asset = Array.isArray(release.assets)
      ? release.assets.find((item: { name?: unknown }) => String(item?.name).endsWith(".apk"))
      : undefined;
    if (!match || typeof asset?.browser_download_url !== "string") continue;
    const versionCode = Number(match[2]);
    if (versionCode <= installedVersionCode || (newest && versionCode <= newest.versionCode)) {
      continue;
    }
    newest = { version: match[1]!, versionCode, apkUrl: asset.browser_download_url };
  }
  return newest;
}
