import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import type { SidebarThreadSummary } from "../../types";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";

export type SidebarSubagentsByParent = ReadonlyMap<string, readonly SidebarThreadSummary[]>;

/** Titles only, nested under the parent row. Open while an agent runs or waits on the user; the user's toggle wins. */
export function SidebarSubagentList(props: {
  parentKey: string;
  subagentsByParent: SidebarSubagentsByParent;
  activeThreadKey: string | null;
  onThreadActivate: (threadRef: ScopedThreadRef) => void;
}) {
  const { parentKey, subagentsByParent, activeThreadKey, onThreadActivate } = props;
  const children = subagentsByParent.get(parentKey);
  const [toggled, setToggled] = useState<boolean | null>(null);
  if (children === undefined || children.length === 0) return null;
  const needsAttention = children.some(
    (child) => isThreadWorking(child) || child.hasPendingApprovals || child.hasPendingUserInput,
  );
  const open = toggled ?? needsAttention;
  return (
    <div className="ms-4 border-s border-border/60 ps-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setToggled(!open)}
        className="flex h-6 w-full items-center gap-1 rounded-sm px-1 text-start text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ChevronRightIcon
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <span className="truncate">
          {children.length === 1 ? "1 subagent" : `${children.length} subagents`}
        </span>
      </button>
      {open ? (
        <ul className="flex flex-col">
          {children.map((child) => {
            const childRef = scopeThreadRef(child.environmentId, child.id);
            const childKey = scopedThreadKey(childRef);
            return (
              <li key={childKey} className="list-none">
                <button
                  type="button"
                  aria-current={activeThreadKey === childKey ? "page" : undefined}
                  onClick={() => onThreadActivate(childRef)}
                  className={cn(
                    "flex h-7 w-full items-center gap-2 rounded-md px-2 text-start text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    activeThreadKey === childKey && "bg-accent text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      child.hasPendingApprovals || child.hasPendingUserInput
                        ? "bg-warning"
                        : isThreadWorking(child)
                          ? "bg-primary"
                          : "bg-muted-foreground/40",
                    )}
                  />
                  <span dir="auto" className="min-w-0 truncate">
                    {child.title}
                  </span>
                </button>
                <SidebarSubagentList
                  parentKey={childKey}
                  subagentsByParent={subagentsByParent}
                  activeThreadKey={activeThreadKey}
                  onThreadActivate={onThreadActivate}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
