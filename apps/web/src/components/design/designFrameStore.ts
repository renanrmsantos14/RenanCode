import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { create } from "zustand";

interface DesignFrameState {
  readonly focusedByThread: Readonly<Record<string, string>>;
  readonly addMenuOpen: Readonly<Record<string, true>>;
  readonly focus: (threadRef: ScopedThreadRef, nodeId: string | null) => void;
  readonly setAddMenuOpen: (threadRef: ScopedThreadRef, open: boolean) => void;
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

/**
 * The one Frame per thread that runs live (everything else shows its saved print), and whether the
 * "Add Frame" menu is open, so the command palette can open it before the canvas has mounted.
 */
export const useDesignFrameStore = create<DesignFrameState>()((set) => ({
  focusedByThread: {},
  addMenuOpen: {},
  focus: (threadRef, nodeId) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      if (state.focusedByThread[key] === (nodeId ?? undefined)) return state;
      const rest = without(state.focusedByThread, key);
      return { focusedByThread: nodeId === null ? rest : { ...rest, [key]: nodeId } };
    }),
  setAddMenuOpen: (threadRef, open) =>
    set((state) => {
      const key = scopedThreadKey(threadRef);
      if ((state.addMenuOpen[key] === true) === open) return state;
      const rest = without(state.addMenuOpen, key);
      return { addMenuOpen: open ? { ...rest, [key]: true } : rest };
    }),
}));
