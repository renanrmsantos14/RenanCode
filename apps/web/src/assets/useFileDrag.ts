import type { AssetResource, EnvironmentId } from "@t3tools/contracts";
import { useRef, type DragEvent } from "react";

import { toastManager } from "~/components/ui/toast";

import { useAssetUrlRefresh } from "./assetUrls";

const MAX_PREFETCH_BYTES = 100 * 1024 * 1024;
// Desktop deletes staged files after an hour; restage before that.
const STAGED_TTL_MS = 50 * 60 * 1000;

interface PreparedDrag {
  readonly key: string;
  readonly stagedAt: number;
  token: string | null;
}

/**
 * Electron needs the file on disk before `dragstart` returns, so the bytes are
 * staged on hover and the drag starts from the cached token. Empty outside desktop.
 */
export function useFileDrag(
  environmentId: EnvironmentId | null,
  resource: AssetResource | null,
  name: string,
  sizeBytes?: number,
) {
  const prepareUrl = useAssetUrlRefresh(environmentId, resource);
  const prepared = useRef<PreparedDrag | null>(null);
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (
    !bridge?.prepareFileDrag ||
    !bridge.startFileDrag ||
    resource === null ||
    (sizeBytes !== undefined && sizeBytes > MAX_PREFETCH_BYTES)
  ) {
    return {};
  }
  const key = JSON.stringify([environmentId, resource]);

  const prepare = () => {
    const current = prepared.current;
    if (current?.key === key && Date.now() - current.stagedAt < STAGED_TTL_MS) return;
    const entry: PreparedDrag = { key, stagedAt: Date.now(), token: null };
    prepared.current = entry;
    void (async () => {
      const url = await prepareUrl();
      if (url === null) throw new Error("Reconnect to the environment and try again.");
      const response = await fetch(url);
      if (!response.ok) throw new Error("The file could not be loaded.");
      const { token } = await bridge.prepareFileDrag({
        name,
        bytes: await response.arrayBuffer(),
      });
      entry.token = token;
    })().catch(() => {
      if (prepared.current === entry) prepared.current = null;
    });
  };

  return {
    draggable: true,
    onPointerEnter: prepare,
    onPointerDown: prepare,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      const current = prepared.current;
      const token =
        current?.key === key && Date.now() - current.stagedAt < STAGED_TTL_MS
          ? current.token
          : null;
      if (token !== null) {
        bridge.startFileDrag(token);
        return;
      }
      prepare();
      toastManager.add({ type: "info", title: "Preparing file…" });
    },
  };
}
