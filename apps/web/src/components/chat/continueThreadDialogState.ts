import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "~/rpc/atomRegistry";

/**
 * Which thread has the "Continue on another machine" dialog open. The thread menu and the
 * command palette close as their command runs, so one host in the root renders the dialog.
 */
export const continueThreadDialogThreadAtom = Atom.make<ScopedThreadRef | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("continue-thread:dialog-thread"),
);

export function openContinueThreadDialog(threadRef: ScopedThreadRef): void {
  appAtomRegistry.set(continueThreadDialogThreadAtom, threadRef);
}
