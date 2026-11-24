import { GUEST_RENDER_ROUTE, GUEST_SHARE_PARAM } from "@t3tools/contracts";
import { htmlRenderThemeFragment } from "@t3tools/shared/htmlRender";
import type { DesignSketchReference } from "@t3tools/shared/design";
import { useState } from "react";

import { useHtmlRenderTheme } from "~/hooks/useHtmlRenderTheme";

import { DesignSketchCard, DesignSketchCardGrid, SketchViewerDialog } from "./DesignSketchCard";

function guestSketchUrl(shareId: string, itemId: string, index: number, thumbnail: boolean) {
  return `${GUEST_RENDER_ROUTE}?${GUEST_SHARE_PARAM}=${encodeURIComponent(shareId)}&item=${encodeURIComponent(itemId)}&variant=${index}${thumbnail ? "&thumbnail=1" : ""}`;
}

/** Sketch cards on a shared thread: the guest route serves the pages and thumbnails, and there is no canvas. */
export function GuestDesignSketches(props: {
  readonly shareId: string;
  readonly itemId: string;
  readonly sketches: ReadonlyArray<DesignSketchReference>;
}) {
  const theme = useHtmlRenderTheme();
  const [viewing, setViewing] = useState<number | null>(null);
  return (
    <div className="min-w-0 px-1">
      <DesignSketchCardGrid
        sketches={props.sketches}
        renderCard={(sketch, index, letter) => (
          <DesignSketchCard
            sketch={sketch}
            thumbnailSrc={
              sketch.thumbnailAttachmentId === null
                ? null
                : guestSketchUrl(props.shareId, props.itemId, index, true)
            }
            letter={letter}
            onOpen={() => setViewing(index)}
          />
        )}
      />
      {viewing !== null ? (
        <SketchViewerDialog
          sketches={props.sketches}
          index={viewing}
          onIndexChange={setViewing}
          src={`${guestSketchUrl(props.shareId, props.itemId, viewing, false)}${htmlRenderThemeFragment(theme)}`}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
