import { cn } from "~/lib/utils";

/** A warning dot that pings a few times when it mounts, then holds still. */
export function AttentionDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("pointer-events-none absolute size-2 rounded-full bg-warning", className)}
      aria-hidden
    >
      <span className="absolute inset-0 rounded-full bg-warning opacity-0 motion-safe:animate-attention-ping" />
    </span>
  );
}
