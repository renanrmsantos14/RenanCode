import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { environmentSummaries } from "~/state/presentation";

/** The action is for a thread whose machine this client cannot reach right now. */
export const canContinueElsewhereAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(
    (get) => !get(environmentSummaries.connectedEnvironmentIdsAtom).includes(environmentId),
  ).pipe(Atom.withLabel(`continue-thread:available:${environmentId}`)),
);
