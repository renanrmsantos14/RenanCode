import type {
  DesignFrameNode as DesignFrameData,
  EnvironmentId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { type Node, type NodeProps, useViewportStore } from "@xyflow/react";
import { useGT } from "gt-react";
import { GlobeIcon, MousePointerClickIcon, RadioIcon } from "lucide-react";
import { createContext, use, useState } from "react";

import { BrowserSurfaceSlot } from "~/browser/BrowserSurfaceSlot";

import { Button } from "../ui/button";
import { commitPickedElement } from "../preview/commitPickedElement";
import { focusPreviewWebview } from "../preview/focusPreviewWebview";
import { previewBridge } from "../preview/previewBridge";
import { useSketchThumbnailUrl } from "./sketchAssets";
import { useDesignFrameLive } from "./useDesignFrameLive";

export type FrameFlowNode = Node<{ readonly frame: DesignFrameData }, "frame">;

interface DesignFrameContextValue {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly canWrite: boolean;
  readonly focusedId: string | undefined;
}

export const DesignFrameContext = createContext<DesignFrameContextValue | null>(null);

/** Below this zoom the page is a speck; the print says as much and a live webview would cost a layer. */
const LIVE_FRAME_MIN_ZOOM = 0.1;

export function FrameNode({
  data,
  selected,
  positionAbsoluteX,
  positionAbsoluteY,
}: NodeProps<FrameFlowNode>) {
  const gt = useGT();
  const ctx = use(DesignFrameContext)!;
  const { frame } = data;
  const translateX = useViewportStore((state) => state.transform[0]);
  const translateY = useViewportStore((state) => state.transform[1]);
  const zoom = useViewportStore((state) => state.transform[2]);
  const containerWidth = useViewportStore((state) => state.width);
  const containerHeight = useViewportStore((state) => state.height);
  const [picking, setPicking] = useState(false);

  // A desktop webview is a native layer above the page, so it only runs where the canvas shows the whole Frame.
  const left = positionAbsoluteX * zoom + translateX;
  const top = positionAbsoluteY * zoom + translateY;
  const fullyInView =
    left >= 0 &&
    top >= 0 &&
    left + frame.width * zoom <= containerWidth &&
    top + frame.height * zoom <= containerHeight;
  const focused = ctx.focusedId === frame.id;
  const live = focused && previewBridge !== null && fullyInView && zoom >= LIVE_FRAME_MIN_ZOOM;
  const runtimeTabId = useDesignFrameLive({
    threadRef: ctx.threadRef,
    frame,
    live,
    canWrite: ctx.canWrite,
  });
  const print = useSketchThumbnailUrl(ctx.environmentId, frame.snapshotAttachmentId);

  const pickElement = async () => {
    if (previewBridge === null || runtimeTabId === null) return;
    if (picking) {
      void previewBridge.cancelPickElement(runtimeTabId).catch(() => undefined);
      return;
    }
    setPicking(true);
    try {
      // The pick only attaches to the composer here; sending a prompt stays in the chat.
      await previewBridge.setAnnotationSendEnabled(runtimeTabId, false);
      focusPreviewWebview(runtimeTabId);
      const result = await previewBridge.pickElement(runtimeTabId);
      if (result !== null) await commitPickedElement({ threadRef: ctx.threadRef, result, gt });
    } finally {
      setPicking(false);
    }
  };

  return (
    <div
      className={`relative size-full rounded-sm bg-card ring-1 ${selected || focused ? "ring-2 ring-primary" : "ring-border"}`}
      data-design-frame={frame.id}
      data-design-frame-live={runtimeTabId !== null ? "true" : "false"}
    >
      <div
        className="absolute start-0 bottom-full flex min-w-0 items-center gap-1.5 pb-1 text-xs text-foreground/80"
        style={{
          width: `${zoom * 100}%`,
          transform: `scale(${1 / zoom})`,
          transformOrigin: "bottom left",
        }}
      >
        <span className="shrink-0 rounded bg-muted px-1 font-medium text-muted-foreground">
          {frame.width}×{frame.height}
        </span>
        <span className="min-w-0 truncate">{frame.title}</span>
        {runtimeTabId !== null ? (
          <span className="flex shrink-0 items-center gap-1 text-success-foreground">
            <RadioIcon className="size-3" />
            {gt("Live")}
          </span>
        ) : null}
        {runtimeTabId !== null ? (
          <Button
            aria-label={picking ? gt("Cancel selection") : gt("Select element")}
            size="icon-xs"
            variant={picking ? "secondary" : "ghost"}
            className="ms-auto shrink-0"
            onClick={() => void pickElement()}
          >
            <MousePointerClickIcon className="size-3" />
          </Button>
        ) : null}
      </div>
      <div className="relative size-full overflow-hidden rounded-sm">
        {print === null ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
            <GlobeIcon className="size-1/6 max-h-16 max-w-16" />
            <span className="max-w-full truncate px-4 text-xs">{frame.url}</span>
          </div>
        ) : (
          <img src={print} alt="" draggable={false} className="size-full object-cover object-top" />
        )}
        {runtimeTabId !== null ? (
          <BrowserSurfaceSlot
            key={runtimeTabId}
            tabId={runtimeTabId}
            visible
            fitSourceContent
            layoutVersion={`${translateX}:${translateY}:${zoom}:${positionAbsoluteX}:${positionAbsoluteY}`}
            className="absolute inset-0"
          />
        ) : null}
      </div>
    </div>
  );
}
