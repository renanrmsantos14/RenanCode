import {
  type MascotGesture,
  type MascotState,
  mascotGestureDelayMs,
  pickMascotGesture,
} from "@t3tools/client-runtime/mascot";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

export function useMascotGesture(state: MascotState, reduceMotion: boolean) {
  const [active, setActive] = useState<{ state: MascotState; gesture: MascotGesture } | null>(null);
  const gesture = active?.state === state ? active.gesture : null;
  const endGesture = useCallback(() => setActive(null), []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a gesture is a timer outside React: it fires 15-30 s after the state settles and is dropped when the state changes
  useEffect(() => {
    if (gesture !== null || reduceMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (AppState.currentState !== "active") {
          schedule();
          return;
        }
        const next = pickMascotGesture(state, Math.random());
        if (next !== null) setActive({ state, gesture: next });
      }, mascotGestureDelayMs(Math.random()));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [gesture, reduceMotion, state]);
  return { gesture, endGesture };
}
