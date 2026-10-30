import { describe, expect, it } from "vite-plus/test";

import { pickNewerApkRelease } from "./apk-release";

const release = (tag: string, assets = [`RenanCode-${tag}.apk`], draft = false) => ({
  tag_name: tag,
  draft,
  assets: assets.map((name) => ({ name, browser_download_url: `https://example.test/${name}` })),
});

describe("pickNewerApkRelease", () => {
  it("returns the highest android release above the installed versionCode", () => {
    expect(
      pickNewerApkRelease(
        [
          release("v0.1.90", ["RenanCode-Setup.exe"]),
          release("android-v2.2.12"),
          release("android-v2.2.15"),
          release("android-v2.2.20", [], false),
          release("android-v2.2.30", undefined, true),
        ],
        12,
      ),
    ).toEqual({
      version: "2.2.15",
      versionCode: 15,
      apkUrl: "https://example.test/RenanCode-android-v2.2.15.apk",
    });
  });

  it("returns null when installed is current or the payload is not a release list", () => {
    expect(pickNewerApkRelease([release("android-v2.2.15")], 15)).toBeNull();
    expect(pickNewerApkRelease({ message: "API rate limit exceeded" }, 1)).toBeNull();
  });
});
