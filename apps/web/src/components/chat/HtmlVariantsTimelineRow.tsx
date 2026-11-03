import {
  HTML_RENDER_COLUMN_WIDTH,
  htmlVariantFollowUpText,
  htmlVariantLetter,
  htmlVariantsFrameHeight,
  type HtmlVariantReference,
} from "@t3tools/shared/htmlRender";
import { type ReactNode, use, useRef, useState } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

import { Button } from "../ui/button";
import { HtmlRenderFrame } from "./HtmlRenderFrame";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";

const MIN_CELL_WIDTH = 320;

export function HtmlVariantsGrid(props: {
  readonly variants: ReadonlyArray<HtmlVariantReference>;
  readonly renderVariant: (
    variant: HtmlVariantReference,
    index: number,
    minHeight: number,
  ) => ReactNode;
  readonly onFollow?: ((text: string) => boolean) | undefined;
}) {
  const [width, setWidth] = useState(HTML_RENDER_COLUMN_WIDTH);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const observeBox = (box: HTMLDivElement) => {
    setWidth(box.clientWidth);
    return observeResize(box, ([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
  };
  const sideBySide = width >= props.variants.length * MIN_CELL_WIDTH;
  const cellWidth = sideBySide ? width / props.variants.length : width;
  const minHeight = htmlVariantsFrameHeight(props.variants, cellWidth);

  return (
    <div ref={observeBox} className="flex min-w-0 flex-col gap-2">
      {sideBySide ? null : (
        <div className="flex gap-1">
          {props.variants.map((variant, index) => (
            <Button
              key={variant.attachmentId}
              aria-label={`Show ${variant.label}`}
              size="xs"
              variant="outline"
              onClick={() =>
                scrollerRef.current?.children[index]?.scrollIntoView({
                  inline: "start",
                  block: "nearest",
                })
              }
            >
              {htmlVariantLetter(index)}
            </Button>
          ))}
        </div>
      )}
      <div
        ref={scrollerRef}
        className={cn(
          "gap-3",
          sideBySide ? "grid" : "flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain",
        )}
        style={
          sideBySide
            ? { gridTemplateColumns: `repeat(${props.variants.length}, minmax(0, 1fr))` }
            : undefined
        }
      >
        {props.variants.map((variant, index) => (
          <div
            key={variant.attachmentId}
            className={cn(
              "flex min-w-0 flex-col gap-1.5",
              !sideBySide && "w-full shrink-0 snap-start",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium text-muted-foreground text-xs">
                {htmlVariantLetter(index)} · {variant.label}
              </span>
              {props.onFollow ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => props.onFollow?.(htmlVariantFollowUpText(index, variant.label))}
                >
                  Use {htmlVariantLetter(index)}
                </Button>
              ) : null}
            </div>
            {props.renderVariant(variant, index, minHeight)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HtmlVariantsTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "html-variants" }>;
}) {
  const ctx = use(TimelineRowCtx);
  const { onAppFullscreenChange } = ctx;
  return (
    <div className="min-w-0 px-1">
      <HtmlVariantsGrid
        variants={row.htmlVariants}
        onFollow={ctx.onFollowHtmlVariant}
        renderVariant={(variant, index, minHeight) =>
          ctx.renderHtmlVariant?.(row, index, minHeight) ?? (
            <HtmlRenderFrame
              key={variant.attachmentId}
              environmentId={ctx.activeThreadEnvironmentId}
              htmlRender={variant}
              minHeight={minHeight}
              threadRef={ctx.threadRef ?? undefined}
              onFullscreenChange={(fullscreen) => onAppFullscreenChange(row.id, fullscreen)}
            />
          )
        }
      />
    </div>
  );
}
