import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "~/rpc/atomRegistry";

export type ComponentToolMode = "find" | "replace" | "web";

export interface ComponentToolRequest {
  readonly threadRef: ScopedThreadRef;
  readonly mode: ComponentToolMode;
}

/** The thread menus close as their command runs, so one host in the root renders the dialog. */
export const componentToolsDialogAtom = Atom.make<ComponentToolRequest | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("component-tools:dialog"),
);

export function openComponentToolsDialog(threadRef: ScopedThreadRef, mode: ComponentToolMode) {
  appAtomRegistry.set(componentToolsDialogAtom, { threadRef, mode });
}
