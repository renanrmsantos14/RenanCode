// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Plain Electron IPC module: startDrag must run synchronously in the event handler.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as Electron from "electron";

import * as IpcChannels from "./ipc/channels.ts";

export const FILE_DRAG_MAX_BYTES = 100 * 1024 * 1024;
export const FILE_DRAG_TTL_MS = 60 * 60 * 1000;
const ICON_SIZE = 32;

export interface FileDragEntry {
  readonly path: string;
  readonly createdAt: number;
}

export function sanitizeDragFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
    .replace(/[. ]+$/, "")
    .trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "file" : cleaned;
}

export function isDragSizeAllowed(byteLength: number): boolean {
  return byteLength <= FILE_DRAG_MAX_BYTES;
}

export function selectExpiredTokens(
  entries: ReadonlyMap<string, FileDragEntry>,
  now: number,
): string[] {
  return [...entries].filter(([, e]) => now - e.createdAt > FILE_DRAG_TTL_MS).map(([t]) => t);
}

export function installFileDrag(iconPath: string | undefined): void {
  const dragRoot = NodePath.join(Electron.app.getPath("temp"), "t3-drag");
  const entries = new Map<string, FileDragEntry>();

  const removeEntry = (token: string) => {
    const entry = entries.get(token);
    entries.delete(token);
    if (entry) NodeFS.rmSync(NodePath.dirname(entry.path), { recursive: true, force: true });
  };

  const isTrustedSender = (sender: Electron.WebContents) =>
    Electron.BrowserWindow.fromWebContents(sender) !== null;

  Electron.ipcMain.removeHandler(IpcChannels.PREPARE_FILE_DRAG_CHANNEL);
  Electron.ipcMain.handle(IpcChannels.PREPARE_FILE_DRAG_CHANNEL, async (event, input: unknown) => {
    if (!isTrustedSender(event.sender)) throw new Error("Untrusted file drag sender.");
    const { name, bytes } = (input ?? {}) as { name?: unknown; bytes?: unknown };
    if (typeof name !== "string" || !(bytes instanceof ArrayBuffer || ArrayBuffer.isView(bytes))) {
      throw new Error("Invalid file drag payload.");
    }
    if (!isDragSizeAllowed(bytes.byteLength)) throw new Error("File is too large to drag.");

    for (const token of selectExpiredTokens(entries, Date.now())) removeEntry(token);

    const dir = NodePath.join(dragRoot, NodeCrypto.randomUUID());
    const file = NodePath.join(dir, sanitizeDragFileName(name));
    await NodeFS.promises.mkdir(dir, { recursive: true });
    const data = ArrayBuffer.isView(bytes)
      ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new Uint8Array(bytes);
    await NodeFS.promises.writeFile(file, data);

    const token = NodeCrypto.randomUUID();
    entries.set(token, { path: file, createdAt: Date.now() });
    return { token };
  });

  Electron.ipcMain.removeAllListeners(IpcChannels.START_FILE_DRAG_CHANNEL);
  Electron.ipcMain.on(IpcChannels.START_FILE_DRAG_CHANNEL, (event, token: unknown) => {
    if (typeof token !== "string" || !isTrustedSender(event.sender)) return;
    const entry = entries.get(token);
    if (!entry) return;
    // macOS rejects an empty drag icon.
    const icon = Electron.nativeImage
      .createFromPath(iconPath ?? "")
      .resize({ width: ICON_SIZE, height: ICON_SIZE });
    event.sender.startDrag({ file: entry.path, icon });
  });

  Electron.app.once("will-quit", () => {
    try {
      NodeFS.rmSync(dragRoot, { recursive: true, force: true });
    } catch {}
  });
}
