// Opt in at bundle time with EXPO_PUBLIC_T3_THREAD_OPEN_TRACE=1. Release builds log through
// `adb logcat -s ReactNativeJS` or the Xcode console; nothing is kept or sent anywhere.
const enabled = process.env.EXPO_PUBLIC_T3_THREAD_OPEN_TRACE === "1";

let opening: { readonly threadKey: string; readonly startedAt: number } | null = null;
const marked = new Set<string>();

/** Starts timing an open; each later stage logs once with its milliseconds since this. */
export function traceThreadOpenStart(threadKey: string) {
  if (!enabled) return;
  opening = { threadKey, startedAt: performance.now() };
  marked.clear();
}

export function traceThreadOpenStage(stage: string, threadKey: string) {
  if (!enabled || opening === null || opening.threadKey !== threadKey || marked.has(stage)) return;
  marked.add(stage);
  const elapsed = Math.round(performance.now() - opening.startedAt);
  console.log(`[t3-thread-open] ${stage} +${elapsed}ms ${threadKey}`);
}
