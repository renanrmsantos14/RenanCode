export type CacheAction = "keep-warm-toggle" | "compact" | "handoff";

const EVENT_NAME = "t3code:cache-action";

export function dispatchCacheAction(action: CacheAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CacheAction>(EVENT_NAME, { detail: action }));
}

export function subscribeCacheAction(listener: (action: CacheAction) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<CacheAction>).detail;
    if (typeof detail === "string") listener(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
