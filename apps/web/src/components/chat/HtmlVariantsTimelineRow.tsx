import {
  HTML_RENDER_COLUMN_WIDTH,
  htmlVariantChoiceTag,
  htmlVariantLetter,
  htmlVariantsFrameHeight,
  type HtmlVariantReference,
} from "@t3tools/shared/htmlRender";
import type { DesignSketchReference } from "@t3tools/shared/design";
import { RadioGroup } from "@base-ui/react/radio-group";
import { T, useGT, Var } from "gt-react";
import { Maximize2Icon } from "lucide-react";
import { type ReactNode, use, useRef, useState } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";

import { Button } from "../ui/button";
import { Radio } from "../ui/radio-group";
import { useDesignSketchOpener } from "../design/DesignSketchTimelineRow";
import { HtmlRenderFrame } from "./HtmlRenderFrame";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";

const MIN_CELL_WIDTH = 200;

export function HtmlVariantsGrid(props: {
  readonly variants: ReadonlyArray<HtmlVariantReference>;
  readonly renderVariant: (
    variant: HtmlVariantReference,
    index: number,
    minHeight: number,
  ) => ReactNode;
  readonly onFollow?: ((text: string) => boolean) | undefined;
  /** Opens one option in the live viewer; unset, the cell has no open button. */
  readonly onOpen?: ((index: number) => void) | undefined;
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
        <div className="flex gap-1 overflow-x-auto">
          {props.variants.map((variant, index) => (
            <Button
              key={variant.attachmentId}
              aria-label={gt("Show {variant}", { variant: variant.label })}
              className="shrink-0"
              size="xs"
              variant="outline"
              onClick={() => {
                const cells = scrollerRef.current?.querySelectorAll("[data-variant-cell]");
                cells?.[index]?.scrollIntoView({ inline: "start", block: "nearest" });
              }}
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
            <div className="flex min-w-0 items-center gap-1">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 font-medium text-muted-foreground text-xs">
                {props.onFollow ? <Radio value={String(index)} /> : null}
                <span className="min-w-0 truncate">
                  {htmlVariantLetter(index)} · {variant.label}
                </span>
              </label>
              {props.onOpen ? (
                <Button
                  aria-label={gt("Open {variant}", { variant: variant.label })}
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => props.onOpen?.(index)}
                >
                  <Maximize2Icon className="size-3.5" />
                </Button>
              ) : null}
            </div>
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
  const { onAppFullscreenChange, onOpenHtmlVariants } = ctx;
  const [showAll, setShowAll] = useState(false);
  const renderFrame = (variant: HtmlVariantReference, index: number, minHeight: number) =>
    ctx.renderHtmlVariant?.(row, index, minHeight) ?? (
      <HtmlRenderFrame
        key={variant.attachmentId}
        environmentId={ctx.activeThreadEnvironmentId}
        htmlRender={variant}
        minHeight={minHeight}
        threadRef={ctx.threadRef ?? undefined}
        onFullscreenChange={(fullscreen) => onAppFullscreenChange(row.id, fullscreen)}
        onOpenFullscreen={
          onOpenHtmlVariants
            ? () => onOpenHtmlVariants(row.id, row.htmlVariants, index)
            : ctx.onOpenHtmlRender
        }
      />
    );
  const chosen = row.choice === null ? undefined : row.htmlVariants[row.choice.index];
  // The guest page draws its own variants and has no Design section to open.
  const designSketches = ctx.renderHtmlVariant === undefined ? row.designSketches : null;
  if (row.choice !== null && chosen !== undefined && !showAll) {
    return (
      <div className="min-w-0 px-1">
        <HtmlVariantChoiceSummary
          letter={htmlVariantLetter(row.choice.index)}
          label={chosen.label}
          note={row.choice.note}
          thumbnail={renderFrame(chosen, row.choice.index, THUMBNAIL_SOURCE_HEIGHT)}
          onShowAll={() => setShowAll(true)}
        />
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1 px-1">
      <HtmlVariantsGrid
        variants={row.htmlVariants}
        onFollow={ctx.onFollowHtmlVariant}
        onOpen={
          onOpenHtmlVariants
            ? (index) => onOpenHtmlVariants(row.id, row.htmlVariants, index)
            : undefined
        }
        renderVariant={renderFrame}
      />
      {row.choice !== null || designSketches !== null ? (
        <div className="flex gap-1">
          {row.choice !== null ? (
            <Button size="xs" variant="ghost" onClick={() => setShowAll(false)}>
              <T>Collapse</T>
            </Button>
          ) : null}
          {designSketches !== null ? <OpenInDesignButton sketches={designSketches} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function OpenInDesignButton(props: { readonly sketches: ReadonlyArray<DesignSketchReference> }) {
  const { open, viewer } = useDesignSketchOpener(props.sketches);
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => void open(0)}>
        <T>Open in Design</T>
      </Button>
      {viewer}
    </>
  );
}

const THUMBNAIL_SOURCE_WIDTH = 480;
const THUMBNAIL_SOURCE_HEIGHT = 300;
const THUMBNAIL_SCALE = 0.2;

function HtmlVariantChoiceSummary(props: {
  readonly letter: string;
  readonly label: string;
  readonly note: string;
  readonly thumbnail: ReactNode;
  readonly onShowAll: () => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border bg-card px-2 py-1.5">
      <div
        aria-hidden
        className="relative shrink-0 overflow-hidden rounded border bg-background"
        style={{
          width: THUMBNAIL_SOURCE_WIDTH * THUMBNAIL_SCALE,
          height: THUMBNAIL_SOURCE_HEIGHT * THUMBNAIL_SCALE,
        }}
      >
        <div
          className="pointer-events-none origin-top-left"
          inert
          style={{ width: THUMBNAIL_SOURCE_WIDTH, transform: `scale(${THUMBNAIL_SCALE})` }}
        >
          {props.thumbnail}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">
          <T>
            You chose <Var>{props.letter}</Var> · <Var>{props.label}</Var>
          </T>
        </span>
        {props.note === "" ? null : (
          <span className="truncate text-muted-foreground text-xs">{props.note}</span>
        )}
      </div>
      <Button size="xs" variant="outline" onClick={props.onShowAll}>
        <T>Show all</T>
      </Button>
    </div>
  );
}
