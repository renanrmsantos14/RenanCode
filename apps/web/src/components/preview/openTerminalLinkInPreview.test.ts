import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { OpenPreviewMutation } from "~/browser/openFileInPreview";

import { openTerminalLinkInPreview } from "./openTerminalLinkInPreview";

vi.mock("~/previewStateStore", () => ({
  applyPreviewServerSnapshot: vi.fn(),
  isPreviewSupportedInRuntime: () => true,
}));

vi.mock("~/rightPanelStore", () => ({
  useRightPanelStore: {
    getState: () => ({ openBrowser: vi.fn() }),
  },
}));

const browserDefaultsMocks = vi.hoisted(() => ({
  resolve: vi.fn(),
}));

vi.mock("~/browser/browserDefaults", () => ({
  resolveBrowserDefaults: browserDefaultsMocks.resolve,
}));

const linkTargetMocks = vi.hoisted(() => ({
  preference: vi.fn<() => "system" | "app">(),
}));

vi.mock("~/browser/browserLinkTarget", () => ({
  resolveBrowserLinkTargetPreference: async () => linkTargetMocks.preference(),
  isWebUrl: (url: string) => /^https?:/u.test(url),
}));

const entityMocks = vi.hoisted(() => ({ serverBrowser: vi.fn<() => boolean>() }));

vi.mock("~/state/entities", () => ({
  readEnvironmentSupportsServerBrowser: () => entityMocks.serverBrowser(),
  useEnvironmentSupportsServerBrowser: () => entityMocks.serverBrowser(),
}));

const hydratedDefaults = {
  viewport: { _tag: "fixed", width: 1280, height: 720 } as const,
  profileId: "work",
};

const threadRef = {
  environmentId: "local" as ScopedThreadRef["environmentId"],
  threadId: "thread-1" as ScopedThreadRef["threadId"],
};

beforeEach(() => {
  browserDefaultsMocks.resolve.mockReset();
  browserDefaultsMocks.resolve.mockResolvedValue(hydratedDefaults);
  linkTargetMocks.preference.mockReturnValue("app");
  entityMocks.serverBrowser.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openTerminalLinkInPreview", () => {
  it("does not report or fall back when opening the preview is interrupted", async () => {
    const fallbackToBrowser = vi.fn();
    const reportError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await openTerminalLinkInPreview({
      url: "http://localhost:5173/",
      threadRef,
      openPreview: async () => AsyncResult.failure(Cause.interrupt()),
      fallbackToBrowser,
    });

    expect(reportError).not.toHaveBeenCalled();
    expect(fallbackToBrowser).not.toHaveBeenCalled();
  });

  it.each([
    ["http://localhost:36472/", "server"],
    ["http://127.0.0.1:36472/", "server"],
  ])("opens %s with runtime %s on a server-browser environment", async (url, runtime) => {
    entityMocks.serverBrowser.mockReturnValue(true);
    const openPreview = vi.fn<OpenPreviewMutation<never>>(async () =>
      AsyncResult.failure(Cause.interrupt()),
    );

    await openTerminalLinkInPreview({ url, threadRef, openPreview, fallbackToBrowser: vi.fn() });

    expect(openPreview).toHaveBeenCalledWith(
      expect.objectContaining({ input: expect.objectContaining({ runtime }) }),
    );
  });
});
