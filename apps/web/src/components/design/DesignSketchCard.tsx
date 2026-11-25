import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import type { DesignSketchReference } from "@t3tools/shared/design";
import { htmlVariantLetter } from "@t3tools/shared/htmlRender";
import { useGT } from "gt-react";
import { FrameIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { cn } from "~/lib/utils";

import { HtmlRenderDialog } from "../chat/HtmlRenderDialog";
import { useSketchPageUrl, useSketchThumbnailUrl } from "./sketchAssets";

const CARD_MAX_THUMBNAIL_HEIGHT = 260;

/** One saved screen in the chat. The caller supplies how its picture is loaded and what a click does. */
export function DesignSketchCard(props: {
  readonly sketch: DesignSketchReference;
  readonly thumbnailSrc: string | null;
  readonly letter?: string | undefined;
  readonly onOpen: () => void;
}) {
  const gt = useGT();
  const { sketch } = props;
  return (
    <button
      type="button"
      aria-label={gt("Open sketch {title}", { title: sketch.title })}
      className="group/design-card flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-2 text-start transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
      onClick={props.onOpen}
    >
      <div
        className="relative w-full overflow-hidden rounded-md bg-muted/40 ring-1 ring-border/50"
        style={{
          aspectRatio:
            props.thumbnailSrc === null
              ? "16 / 6"
              : props.letter
                ? "16 / 10"
                : `${sketch.width} / ${Math.min(sketch.height, sketch.width)}`,
          maxHeight: CARD_MAX_THUMBNAIL_HEIGHT,
        }}
      >
        {props.thumbnailSrc !== null ? (
          <img
            src={props.thumbnailSrc}
            alt=""
            draggable={false}
            loading="lazy"
            className={cn("size-full object-top", props.letter ? "object-contain" : "object-cover")}
          />
        ) : (
          <div
            role="img"
            aria-label={gt("Sketch without thumbnail")}
            className="flex size-full items-center justify-center text-muted-foreground"
          >
            <FrameIcon className="size-6" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-xs">
        {props.letter ? (
          <span className="shrink-0 rounded bg-muted px-1 font-medium text-muted-foreground">
            {props.letter}
          </span>
        ) : null}
        <span className="min-w-0 truncate font-medium">{sketch.title}</span>
        {sketch.label ? (
          <span className="min-w-0 truncate text-muted-foreground">{sketch.label}</span>
        ) : null}
      </div>
    </button>
  );
}

/** Lays out a card per sketch; several sketches from one call read as lettered variations. */
export function DesignSketchCardGrid(props: {
  readonly sketches: ReadonlyArray<DesignSketchReference>;
  readonly renderCard: (
    sketch: DesignSketchReference,
    index: number,
    letter: string | undefined,
  ) => ReactNode;
}) {
  const lettered = props.sketches.length > 1;
  return (
    <div
      className={cn(
        "grid min-w-0 gap-2",
        props.sketches.length === 1
          ? "max-w-md grid-cols-1"
          : "grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]",
      )}
    >
      {props.sketches.map((sketch, index) => (
        <div key={sketch.sketchId} className="min-w-0">
          {props.renderCard(sketch, index, lettered ? htmlVariantLetter(index) : undefined)}
        </div>
      ))}
    </div>
  );
}

/** The full-screen page of a sketch, with a tab per sibling variation. A null `src` is a page still loading. */
export function SketchViewerDialog(props: {
  readonly sketches: ReadonlyArray<DesignSketchReference>;
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly src: string | null;
  readonly threadRef?: ScopedThreadRef | undefined;
  readonly onClose: () => void;
}) {
  const sketch = props.sketches[props.index];
  if (sketch === undefined || props.src === null) return null;
  return (
    <HtmlRenderDialog
      key={sketch.sketchId}
      src={props.src}
      htmlRender={sketch}
      threadRef={props.threadRef}
      tabs={
        props.sketches.length > 1
          ? props.sketches.map((_, tabIndex) => ({
              label: htmlVariantLetter(tabIndex),
              active: tabIndex === props.index,
              onSelect: () => props.onIndexChange(tabIndex),
            }))
          : undefined
      }
      onClose={props.onClose}
    />
  );
}

/** The viewer for sketches the environment holds. */
export function EnvironmentSketchViewer(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef?: ScopedThreadRef | undefined;
  readonly sketches: ReadonlyArray<DesignSketchReference>;
  readonly initialIndex: number;
  readonly onClose: () => void;
}) {
  const [index, setIndex] = useState(props.initialIndex);
  const sketch = props.sketches[index];
  const src = useSketchPageUrl(props.environmentId, sketch ?? { attachmentId: "", title: "" });
  return (
    <SketchViewerDialog
      sketches={props.sketches}
      index={index}
      onIndexChange={setIndex}
      src={sketch === undefined ? null : src}
      threadRef={props.threadRef}
      onClose={props.onClose}
    />
  );
}

export function EnvironmentSketchThumbnailCard(props: {
  readonly environmentId: EnvironmentId;
  readonly sketch: DesignSketchReference;
  readonly letter?: string | undefined;
  readonly onOpen: () => void;
}) {
  const thumbnailSrc = useSketchThumbnailUrl(
    props.environmentId,
    props.sketch.thumbnailAttachmentId,
  );
  return (
    <DesignSketchCard
      sketch={props.sketch}
      thumbnailSrc={thumbnailSrc}
      letter={props.letter}
      onOpen={props.onOpen}
    />
  );
}
