import {
  HTML_RENDER_COLUMN_WIDTH,
  htmlVariantChoiceTag,
  htmlVariantLetter,
  htmlVariantsFrameHeight,
  type HtmlVariantReference,
} from "@t3tools/shared/htmlRender";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useGT } from "gt-react";
import { type ReactNode, use, useRef, useState } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

import { Button } from "../ui/button";
import { Radio } from "../ui/radio-group";
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
  const gt = useGT();
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
  const [chosen, setChosen] = useState<number | null>(null);
  const chosenVariant = chosen === null ? undefined : props.variants[chosen];

  return (
    <div ref={observeBox} className="flex min-w-0 flex-col gap-2">
      {sideBySide ? null : (
        <div className="flex gap-1">
          {props.variants.map((variant, index) => (
            <Button
              key={variant.attachmentId}
              aria-label={gt("Show {variant}", { variant: variant.label })}
              size="xs"
              variant="outline"
              onClick={() =>
                scrollerRef.current
                  ?.querySelectorAll("[data-variant-cell]")
                  [index]?.scrollIntoView({
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
      <RadioGroup
        ref={scrollerRef}
        aria-label={gt("Variants")}
        value={chosen === null ? "" : String(chosen)}
        onValueChange={(value) => setChosen(Number(value))}
        className={cn(
          "gap-3",
          sideBySide
            ? "grid"
            : "flex flex-row snap-x snap-mandatory overflow-x-auto overscroll-x-contain",
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
            data-variant-cell
            className={cn(
              "flex min-w-0 flex-col gap-1.5 rounded-lg p-1 transition-colors",
              chosen === index ? "bg-accent ring-1 ring-primary/40" : "",
              !sideBySide && "w-full shrink-0 snap-start",
            )}
          >
            <label className="flex min-w-0 cursor-pointer items-center gap-2 px-1 font-medium text-muted-foreground text-xs">
              {props.onFollow ? <Radio value={String(index)} /> : null}
              <span className="min-w-0 truncate">
                {htmlVariantLetter(index)} · {variant.label}
              </span>
            </label>
            {props.renderVariant(variant, index, minHeight)}
          </div>
        ))}
      </RadioGroup>
      {props.onFollow ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            disabled={chosenVariant === undefined}
            onClick={() => {
              if (chosen === null || chosenVariant === undefined) return;
              const tag = htmlVariantChoiceTag(chosen, chosenVariant.label).trimEnd();
              props.onFollow?.(`${gt("I chose {choice}", { choice: tag })} `);
            }}
          >
            {chosen === null
              ? gt("Choose", { $context: "button, picks the selected variant" })
              : gt("Choose {letter}", { letter: htmlVariantLetter(chosen) })}
          </Button>
        </div>
      ) : null}
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
