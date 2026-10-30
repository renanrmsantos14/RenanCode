import { MASCOT_DONE_VISIBLE_MS } from "@t3tools/client-runtime/mascot";
import { useEffect, useState } from "react";

export function useJustCompleted(isWorking: boolean, resetKey: string): boolean {
  const [wasWorking, setWasWorking] = useState(isWorking);
  const [lastKey, setLastKey] = useState(resetKey);
  const [justCompleted, setJustCompleted] = useState(false);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setWasWorking(isWorking);
    setJustCompleted(false);
  } else if (wasWorking !== isWorking) {
    setWasWorking(isWorking);
    setJustCompleted(!isWorking);
  }
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- timer that hides the celebration
  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => setJustCompleted(false), MASCOT_DONE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [justCompleted]);
  return justCompleted;
}
