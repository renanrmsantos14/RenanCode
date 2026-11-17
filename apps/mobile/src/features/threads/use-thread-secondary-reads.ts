import type { EnvironmentThreadStatus } from "@t3tools/client-runtime/state/threads";
import { useEffect, useState } from "react";

// A thread that never goes live (offline, a slow link) still starts them after this.
const SECONDARY_READS_FALLBACK_MS = 1_000;

/**
 * Reads the first frame doesn't show (terminals, devices, browser tabs) wait for the opened
 * thread's own data, so they don't compete with it. Once started they stay on, also when the
 * screen switches threads in place.
 */
export function useThreadSecondaryReadsReady(detailStatus: EnvironmentThreadStatus): boolean {
  const [ready, setReady] = useState(detailStatus === "live");
  if (!ready && (detailStatus === "live" || detailStatus === "deleted")) setReady(true);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a timer starts the reads when the thread does not go live
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), SECONDARY_READS_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [ready]);
  return ready;
}
