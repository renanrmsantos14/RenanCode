import { ChevronDownIcon } from "lucide-react";
import type { MouseEvent } from "react";

import { cn } from "~/lib/utils";

export type SubsessionDot = "attention" | "failed" | "working";

const DOT_CLASS_NAME = {
  attention: "bg-warning",
  failed: "bg-error",
  working: "bg-info",
} as const satisfies Record<SubsessionDot, string>;

const DOT_LABEL = {
  attention: "needs you",
  failed: "failed",
  working: "working",
} as const satisfies Record<SubsessionDot, string>;

/** Folds a thread's nested subsessions. Closed, it counts them and flags work that would otherwise hide. */
export function SubsessionToggle(props: {
  threadKey: string;
  count: number;
  collapsed: boolean;
  dot: SubsessionDot | null;
  onToggle: (threadKey: string) => void;
}) {
  const { collapsed, dot } = props;
  const stop = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand subsessions" : "Collapse subsessions"}
      onClick={(event) => {
        stop(event);
        props.onToggle(props.threadKey);
      }}
      onDoubleClick={stop}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-sm text-muted-foreground/65 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      {collapsed && dot !== null ? (
        <span className={cn("size-1.5 rounded-full", DOT_CLASS_NAME[dot])}>
          <span className="sr-only">{DOT_LABEL[dot]}</span>
        </span>
      ) : null}
      {collapsed ? <span className="text-xs tabular-nums">{props.count}</span> : null}
      <ChevronDownIcon
        aria-hidden
        className={cn(
          "size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
          collapsed && "-rotate-90",
        )}
      />
    </button>
  );
}
