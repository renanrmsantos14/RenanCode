import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { create } from "zustand";

interface DesignFocusState {
  readonly pending: Readonly<Record<string, string>>;
  readonly request: (threadRef: ScopedThreadRef, sketchId: string) => void;
  readonly consume: (threadRef: ScopedThreadRef) => void;
}

/** A card asks the canvas to centre a sketch; the canvas may not be mounted yet, so the ask waits here. */
export const useDesignFocusStore = create<DesignFocusState>()((set) => ({
  pending: {},
  request: (threadRef, sketchId) =>
    set((state) => ({ pending: { ...state.pending, [scopedThreadKey(threadRef)]: sketchId } })),
  consume: (threadRef) =>
    set((state) => {
      const { [scopedThreadKey(threadRef)]: _consumed, ...pending } = state.pending;
      return { pending };
    }),
}));
