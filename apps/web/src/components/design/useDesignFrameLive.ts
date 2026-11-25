import type { DesignFrameNode, ScopedThreadRef } from "@t3tools/contracts";
import { DesignNodeId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { previewRuntimeFor } from "~/browser/previewRuntime";
import { resolveDiscoveredServerUrl } from "~/browser/browserTargetResolver";
import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import {
  beginPreviewSessionClose,
  cancelPreviewSessionClose,
  markDesignFrameTab,
  readThreadPreviewState,
} from "~/previewStateStore";
import { useAtomCommand } from "~/state/use-atom-command";
import { designEnvironment } from "~/state/design";
import { previewEnvironment } from "~/state/preview";

import { openPreviewSession } from "../preview/openPreviewSession";
import { previewBridge } from "../preview/previewBridge";

interface FrameLiveSession {
  readonly frameKey: string;
  readonly tabId: string;
  readonly runtimeTabId: string;
}

/**
 * Runs the Frame's page in a real preview session while `live`, and when it stops being live saves
 * a print of the page and closes the session. Returns the desktop tab id once the page is up.
 */
export function useDesignFrameLive(input: {
  readonly threadRef: ScopedThreadRef;
  readonly frame: DesignFrameNode;
  readonly live: boolean;
  readonly canWrite: boolean;
}): string | null {
  const { threadRef, frame, live, canWrite } = input;
  const openPreview = useAtomCommand(previewEnvironment.open, {
    label: "design frame open",
    reportFailure: false,
  });
  const closePreview = useAtomCommand(previewEnvironment.close, {
    label: "design frame close",
    reportFailure: false,
  });
  const setFrameSnapshot = useAtomCommand(designEnvironment.setFrameSnapshot, {
    label: "design frame snapshot",
    reportFailure: false,
  });
  const reportLiveFrame = useAtomCommand(designEnvironment.reportLiveFrame, {
    label: "design frame live report",
    reportFailure: false,
  });
  const [session, setSession] = useState<FrameLiveSession | null>(null);
  const frameKey = `${frame.id}|${frame.url}|${frame.width}x${frame.height}`;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- opens and closes a desktop webview session, an external system, as the Frame gains and loses focus
  useEffect(() => {
    if (!live || previewBridge === null) return;
    const bridge = previewBridge;
    let cancelled = false;
    let opened: FrameLiveSession | null = null;

    const report = (tabId: string | null) =>
      canWrite
        ? reportLiveFrame({
            environmentId: threadRef.environmentId,
            input: { threadId: threadRef.threadId, nodeId: DesignNodeId.make(frame.id), tabId },
          })
        : Promise.resolve();

    const retire = async (target: FrameLiveSession) => {
      await report(null);
      if (canWrite) {
        const snapshot = await bridge.captureSnapshot(target.runtimeTabId).catch(() => null);
        if (snapshot !== null) {
          await setFrameSnapshot({
            environmentId: threadRef.environmentId,
            input: {
              threadId: threadRef.threadId,
              nodeId: DesignNodeId.make(frame.id),
              png: snapshot.pngBase64,
            },
          });
        }
      }
      beginPreviewSessionClose(threadRef, target.tabId);
      const closed = await closePreview({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId, tabId: target.tabId },
      });
      if (closed._tag === "Failure") {
        cancelPreviewSessionClose(threadRef, null, target.tabId);
        return;
      }
      markDesignFrameTab(target.tabId, false);
    };

    void (async () => {
      const url =
        previewRuntimeFor(threadRef.environmentId) === "server"
          ? frame.url
          : resolveDiscoveredServerUrl(threadRef.environmentId, frame.url);
      const result = await openPreviewSession({
        openPreview,
        threadRef,
        url,
        viewport: { _tag: "freeform", width: frame.width, height: frame.height },
        designFrame: true,
      });
      if (result._tag !== "Success") return;
      const tabId = result.value.tabId;
      const runtimeTabId = previewRuntimeTabId(
        threadRef,
        readThreadPreviewState(threadRef).serverEpoch,
        tabId,
      );
      const next = { frameKey, tabId, runtimeTabId };
      if (cancelled) {
        void retire(next);
        return;
      }
      opened = next;
      setSession(next);
      // The server tells the agent's screenshot tool which preview tab runs this Frame.
      void report(tabId);
    })();

    return () => {
      cancelled = true;
      if (opened !== null) void retire(opened);
      setSession(null);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the command callbacks are stable per render; the Frame's identity, page and size decide when a session restarts
  }, [live, frameKey, threadRef, canWrite]);

  return live && session?.frameKey === frameKey ? session.runtimeTabId : null;
}
