import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { create } from "zustand";

interface DesignFocusState {
  readonly pending: Readonly<Record<string, string>>;
  readonly request: (threadRef: ScopedThreadRef, sketchId: string) => void;
  readonly consume: (threadRef: ScopedThreadRef) => string | undefined;
}

/** A card asks the canvas to centre a sketch; the canvas may not be mounted yet, so the ask waits here. */
export const useDesignFocusStore = create<DesignFocusState>()((set, get) => ({
  pending: {},
  request: (threadRef, sketchId) =>
    set((state) => ({ pending: { ...state.pending, [scopedThreadKey(threadRef)]: sketchId } })),
  consume: (threadRef) => {
    const key = scopedThreadKey(threadRef);
    const sketchId = get().pending[key];
    if (sketchId === undefined) return undefined;
    const { [key]: _consumed, ...rest } = get().pending;
    set({ pending: rest });
    return sketchId;
  },
}));
