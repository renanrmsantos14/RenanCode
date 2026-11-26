import { useGT } from "gt-react";
import { ChevronsUpDownIcon } from "lucide-react";
import { useRef } from "react";

import { cn } from "../../../lib/utils";
import type { ReviewMode, ReviewSheetSnap } from "./useReviewMode";

const SNAP_ORDER: ReadonlyArray<ReviewSheetSnap> = ["peek", "half", "full"];
const SNAP_HEIGHT: Record<ReviewSheetSnap, string> = {
  peek: "h-16",
  half: "h-[50dvh]",
  full: "h-[calc(100dvh-3rem)]",
};
const DRAG_THRESHOLD_PX = 40;

/**
 * Classes the chat column takes while review mode is on: a side drawer on wide screens, a bottom
 * sheet on narrow ones. The column stays mounted, so the timeline and composer keep their state.
 */
export function reviewChatColumnClassName(
  review: Pick<ReviewMode, "active" | "narrow" | "chatHidden" | "sheet">,
): string | undefined {
  if (!review.active) return undefined;
  if (review.narrow) {
    return cn(
      "fixed inset-x-0 bottom-0 z-40 w-auto flex-none overflow-hidden rounded-t-2xl border-t border-border bg-background shadow-2xl transition-[height] duration-200 motion-reduce:transition-none",
      SNAP_HEIGHT[review.sheet],
    );
  }
  return cn(
    "w-[min(26rem,40%)] min-w-80 flex-none border-l border-border",
    review.chatHidden && "invisible absolute inset-y-0 right-0",
  );
}

/** The chat column beside an HTML render opened full screen: left of the panel, or a bottom sheet. */
export function htmlFullscreenChatColumnClassName(
  chat: Pick<ReviewMode, "narrow" | "sheet"> & { readonly shown: boolean },
): string | undefined {
  if (!chat.shown) return undefined;
  if (chat.narrow) {
    return reviewChatColumnClassName({
      active: true,
      narrow: true,
      chatHidden: false,
      sheet: chat.sheet,
    });
  }
  return "w-[min(26rem,40%)] min-w-80 flex-none border-r border-border";
}

/** The grab area of the bottom sheet: drag or tap to move between its snap points. */
export function ReviewSheetHandle({
  review,
  peekLabel,
}: {
  readonly review: Pick<ReviewMode, "active" | "narrow" | "sheet" | "setSheet">;
  /** The agent's pending question, so a collapsed sheet still shows what it is waiting for. */
  readonly peekLabel: string | null;
}) {
  const gt = useGT();
  const dragStartY = useRef<number | null>(null);
  const dragged = useRef(false);
  if (!review.active || !review.narrow) return null;
  const move = (direction: -1 | 1) => {
    const next = SNAP_ORDER[SNAP_ORDER.indexOf(review.sheet) + direction];
    if (next) review.setSheet(next);
  };
  const peek = review.sheet === "peek";
  return (
    <div className="relative z-30 shrink-0 bg-background">
      <button
        type="button"
        aria-label={peek ? gt("Expand chat") : gt("Resize chat")}
        aria-expanded={!peek}
        className="flex h-6 w-full touch-none items-center justify-center outline-none focus-visible:bg-accent"
        onPointerDown={(event) => {
          dragStartY.current = event.clientY;
          dragged.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={(event) => {
          const start = dragStartY.current;
          dragStartY.current = null;
          if (start === null) return;
          const delta = event.clientY - start;
          if (Math.abs(delta) < DRAG_THRESHOLD_PX) return;
          // The click that follows a drag must not move the sheet again.
          dragged.current = true;
          move(delta < 0 ? 1 : -1);
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          if (review.sheet === "full") review.setSheet("half");
          else move(1);
        }}
        onPointerCancel={() => {
          dragStartY.current = null;
        }}
      >
        <span aria-hidden className="h-1 w-10 rounded-full bg-muted-foreground/40" />
      </button>
      {peek ? (
        <button
          type="button"
          className="absolute inset-x-0 top-6 z-30 flex h-10 items-center gap-2 bg-background px-4 text-left text-sm"
          onClick={() => review.setSheet("half")}
        >
          <span className="min-w-0 flex-1 truncate">{peekLabel ?? gt("Chat")}</span>
          <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : null}
    </div>
  );
}
