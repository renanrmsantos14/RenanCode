import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { findContinuationOf } from "@t3tools/client-runtime/state/threadContinuation";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { environmentThreadShells } from "~/state/threads";

/** The thread, on any connected environment, that continues `original`. */
export const continuationOfAtom = Atom.family((key: string) => {
  const [environmentId, threadId] = key.split("\n") as [EnvironmentId, ThreadId];
  const original = scopeThreadRef(environmentId, threadId);
  return Atom.make((get) =>
    findContinuationOf(get(environmentThreadShells.quietThreadShellsAtom), original),
  ).pipe(Atom.withLabel(`continue-thread:continuation-of:${key}`));
});

export const continuationKey = (ref: ScopedThreadRef) => `${ref.environmentId}\n${ref.threadId}`;
