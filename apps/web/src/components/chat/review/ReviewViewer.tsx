import { T, useGT } from "gt-react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FilmIcon,
  ImageIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  TextIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useAssetUrlState } from "../../../assets/assetUrls";
import { isCommandPaletteOpen } from "../../../commandPaletteBus";
import { isContextMenuOpen } from "../../../contextMenuFallback";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { isEditableFocused } from "../../../lib/editableFocus";
import { observeResize } from "../../../lib/observeResize";
import { cn } from "../../../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../../workspaceTitlebar";
import { MediaActions, type MediaActionSource } from "../../media/MediaActions";
import { OpenMediaLink } from "../../media/OpenMediaLink";
import { Button } from "../../ui/button";
import { SharedTooltipTrigger } from "../../ui/shared-tooltip";
import {
  ExpandedMediaFailure,
  ExpandedVideo,
  expandedMediaMimeType,
  type ExpandedMediaAsset,
} from "../ExpandedMedia";
import { buildAttachmentVideoAsset } from "../ExpandedImagePreview";
import { resolveExternalWebLinkHost } from "../externalLinkContextMenu";
import {
  SnapShotAccessibilityData,
  SnapShotContentsButton,
  SnapShotCopyButton,
  snapShotAccessibilityDetails,
} from "../SnapShotAttachmentDetails";
import { ZoomableImage, type ZoomableImageHandle } from "../ZoomableImage";
import { reviewItemTarget, type ReviewItem, type ReviewSourceContext } from "./reviewGallery";
import type { ReviewMode } from "./useReviewMode";
import { ARROW_OWNER_SELECTOR, DIALOG_SELECTOR } from "./viewerKeys";

export interface ReviewImageSource extends ReviewSourceContext {
  readonly threadRef: {
    readonly environmentId: EnvironmentId;
    readonly threadId: ThreadId;
  } | null;
}

const THUMBNAIL_WINDOW = 4;

/** Where the environment serves the item, when it has no usable direct source. */
function reviewItemAsset(item: ReviewItem, source: ReviewImageSource): ExpandedMediaAsset | null {
  if (item.actionsSource?.asset) return item.actionsSource.asset;
  const { threadRef } = source;
  if (!threadRef) return null;
  if (item.videoAttachment) {
    return buildAttachmentVideoAsset(threadRef.environmentId, item.videoAttachment);
  }
  const target = reviewItemTarget(item, source);
  if (target?._tag !== "workspace") return null;
  return {
    environmentId: threadRef.environmentId,
    resource: {
      _tag: "media-file",
      threadId: threadRef.threadId,
      path: target.path,
      ...(target.relative ? { hostOnly: true as const } : {}),
    },
  };
}

function useReviewImageUrl(
  image: ReviewItem,
  source: ReviewImageSource,
): { readonly url: string | null; readonly failed: boolean } {
  const target = reviewItemTarget(image, source);
  const asset = target?._tag === "direct" ? null : reviewItemAsset(image, source);
  const state = useAssetUrlState(asset?.environmentId ?? null, asset?.resource ?? null);
  if (target?._tag === "direct") return { url: target.src, failed: false };
  if (asset === null) return { url: null, failed: true };
  return state._tag === "Success"
    ? { url: state.url, failed: false }
    : { url: null, failed: state._tag === "Failure" };
}

type StageSize = { readonly width: number; readonly height: number };

function useStageSize() {
  const [size, setSize] = useState<StageSize | null>(null);
  const attach = (element: HTMLDivElement) => {
    return observeResize(element, ([entry]) => {
      if (!entry) return;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((current) =>
        current?.width === width && current.height === height ? current : { width, height },
      );
    });
  };
  return [size, attach] as const;
}

function ReviewStageImage({
  item,
  source,
  size,
  zoomRef,
  showContents,
}: {
  readonly item: ReviewItem;
  readonly source: ReviewImageSource;
  readonly size: StageSize;
  readonly zoomRef: RefObject<ZoomableImageHandle | null>;
  readonly showContents: boolean;
}) {
  const gt = useGT();
  const { url, failed } = useReviewImageUrl(item, source);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const details = item.source ? snapShotAccessibilityDetails(item.source) : undefined;
  if (showContents && details) {
    return (
      <SnapShotAccessibilityData
        details={details}
        className="h-[min(var(--media-height),40rem)] w-[min(var(--media-width),42rem)] rounded-lg border border-border/70 bg-background p-4 text-xs leading-5 text-foreground shadow-2xl"
      />
    );
  }
  if (failed || (url !== null && failedUrl === url)) {
    const original =
      item.originalUrl && resolveExternalWebLinkHost(item.originalUrl) !== null
        ? item.originalUrl
        : null;
    return (
      <ExpandedMediaFailure>
        <p>
          {original
            ? gt("This image could not be loaded.")
            : gt("Image unavailable. The file may have been moved or deleted.")}
        </p>
        {original ? <OpenMediaLink originalUrl={original} /> : null}
      </ExpandedMediaFailure>
    );
  }
  if (url === null) return <p className="text-sm text-white/60">{gt("Loading image...")}</p>;
  return (
    <ZoomableImage
      ref={zoomRef}
      key={url}
      src={url}
      name={item.name}
      mimeType={expandedMediaMimeType({ ...item, src: url })}
      bounds={size}
      onError={() => setFailedUrl(url)}
    />
  );
}

function ReviewStage({
  item,
  source,
  zoomRef,
  onClose,
  children,
}: {
  readonly item: ReviewItem;
  readonly source: ReviewImageSource;
  readonly zoomRef: RefObject<ZoomableImageHandle | null>;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}) {
  const gt = useGT();
  const [size, attachStage] = useStageSize();
  const [showContents, setShowContents] = useState(false);
  const target = reviewItemTarget(item, source);
  const directSrc = target?._tag === "direct" ? target.src : null;
  const asset = reviewItemAsset(item, source);
  const actions = item.actionsSource ?? {
    kind: item.kind,
    name: item.name,
    src: directSrc,
    ...(asset ? { asset } : {}),
  };
  const openFile = actions.onOpenFile;
  const actionsSource: MediaActionSource = openFile
    ? {
        ...actions,
        onOpenFile: () => {
          openFile();
          onClose();
        },
      }
    : actions;
  const details = item.source ? snapShotAccessibilityDetails(item.source) : undefined;
  const contentsLabel = showContents
    ? gt("Show screenshot")
    : details?.format === "json"
      ? gt("Show accessibility JSON")
      : gt("Show extracted text");

  return (
    <>
      <div
        ref={attachStage}
        className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-2 max-md:px-2"
        style={
          size
            ? ({
                "--media-width": `${size.width}px`,
                "--media-height": `${size.height}px`,
              } as React.CSSProperties)
            : undefined
        }
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {size === null ? null : (
          <MediaActions source={actionsSource} showTooltip={false}>
            <div className="relative isolate flex max-h-full max-w-full flex-col items-center">
              {item.kind === "video" ? (
                <ExpandedVideo
                  name={item.name}
                  src={directSrc}
                  asset={asset}
                  srcFragment={item.srcFragment}
                  originalUrl={item.originalUrl}
                  autoPlay={item.autoPlay}
                />
              ) : (
                <ReviewStageImage
                  item={item}
                  source={source}
                  size={size}
                  zoomRef={zoomRef}
                  showContents={showContents}
                />
              )}
            </div>
          </MediaActions>
        )}
        {children}
      </div>
      {item.source ? (
        <div className="flex shrink-0 items-center justify-center gap-1.5 pb-2">
          {details ? (
            <SharedTooltipTrigger
              render={
                <Button
                  aria-label={contentsLabel}
                  aria-pressed={showContents}
                  onClick={() => setShowContents((shown) => !shown)}
                  size="icon-micro"
                  variant="overlay"
                />
              }
              label={contentsLabel}
            >
              {showContents ? (
                <ImageIcon className="size-3" aria-hidden="true" />
              ) : (
                <TextIcon className="size-3" aria-hidden="true" />
              )}
            </SharedTooltipTrigger>
          ) : (
            <SnapShotContentsButton source={item.source} side="top" />
          )}
          {item.onCopySnapshot ? (
            <div className="-my-1.5">
              <SnapShotCopyButton onCopy={item.onCopySnapshot} />
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function ReviewPreload({
  image,
  source,
}: {
  readonly image: ReviewItem;
  readonly source: ReviewImageSource;
}) {
  const { url } = useReviewImageUrl(image, source);
  return url === null ? null : <img src={url} alt="" decoding="async" hidden />;
}

function ReviewThumbnailImage({
  image,
  source,
}: {
  readonly image: ReviewItem;
  readonly source: ReviewImageSource;
}) {
  const { url } = useReviewImageUrl(image, source);
  return url === null ? null : (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className="size-full object-cover"
    />
  );
}

function ReviewThumbnail({
  image,
  source,
  current,
  position,
  total,
  onSelect,
}: {
  readonly image: ReviewItem;
  readonly source: ReviewImageSource;
  readonly current: boolean;
  readonly position: number;
  readonly total: number;
  readonly onSelect: () => void;
}) {
  const gt = useGT();
  return (
    <button
      type="button"
      aria-label={gt("Show media {position} of {total}", { position, total })}
      aria-current={current ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/10 ring-2 ring-offset-0 outline-none focus-visible:ring-white",
        current ? "ring-white" : "opacity-60 ring-transparent hover:opacity-100",
      )}
    >
      {image.kind === "video" ? (
        <FilmIcon className="size-5 text-white/80" aria-hidden="true" />
      ) : (
        <ReviewThumbnailImage image={image} source={source} />
      )}
    </button>
  );
}

/** The image side of review mode: it fills the area the chat column leaves free. */
export function ReviewViewer({
  review,
  source,
}: {
  readonly review: ReviewMode;
  readonly source: ReviewImageSource;
}) {
  const gt = useGT();
  const { images, index } = review;
  const image = images[index];
  const total = images.length;
  const zoomRef = useRef<ZoomableImageHandle>(null);
  const onKeyDown = useStableCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || isContextMenuOpen() || isCommandPaletteOpen()) return;
    // A dialog over the review owns Escape and the arrow keys.
    if (event.target instanceof Element && event.target.closest(DIALOG_SELECTOR)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      review.close();
      return;
    }
    if (event.target instanceof HTMLVideoElement) return;
    if (document.activeElement instanceof HTMLIFrameElement) return;
    if (zoomRef.current?.pan(event.key)) {
      event.preventDefault();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditableFocused()) return;
    if (event.target instanceof Element && event.target.closest(ARROW_OWNER_SELECTOR)) return;
    event.preventDefault();
    review.step(event.key === "ArrowLeft" ? -1 : 1);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- document key listener for Esc and the arrow keys while review mode is open
  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);
  const attachSection = (section: HTMLElement) => {
    const opener = document.activeElement;
    section.querySelector<HTMLButtonElement>("[data-review-close]")?.focus();
    return () => {
      const focused = document.activeElement;
      const lost = focused === null || focused === document.body || section.contains(focused);
      if (lost && opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  };

  if (!image) return null;
  const before = images[index - 1];
  const after = images[index + 1];
  const thumbStart = Math.max(0, index - THUMBNAIL_WINDOW);
  const thumbnails = images.slice(thumbStart, index + THUMBNAIL_WINDOW + 1);
  const ChatToggleIcon = review.chatHidden ? PanelRightOpenIcon : PanelRightCloseIcon;
  const chatToggleLabel = review.chatHidden ? gt("Show chat") : gt("Hide chat");

  return (
    <section
      ref={attachSection}
      aria-label={gt("Media review")}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-black text-white"
    >
      <div
        className={cn(
          "drag-region flex h-(--workspace-topbar-height) shrink-0 items-center gap-2 px-3",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          (review.chatHidden || review.narrow) && "wco:pr-(--workspace-native-controls-inset)",
        )}
      >
        <Button
          type="button"
          size="sm"
          variant="media-close"
          aria-label={gt("Close media review")}
          data-review-close=""
          onClick={review.close}
        >
          <XIcon aria-hidden="true" />
          <T>Close</T>
        </Button>
        <p className="min-w-0 flex-1 truncate text-center text-xs text-white/80">
          <span aria-live="polite" aria-atomic="true">
            {image.name}
          </span>
          <span className="ml-2 tabular-nums text-white/60">{`${index + 1} / ${total}`}</span>
        </p>
        {review.narrow ? null : (
          <Button
            type="button"
            size="icon-sm"
            variant="media-close"
            aria-label={chatToggleLabel}
            aria-pressed={review.chatHidden}
            onClick={review.toggleChat}
          >
            <ChatToggleIcon aria-hidden="true" />
          </Button>
        )}
      </div>
      <ReviewStage
        key={image.key}
        item={image}
        source={source}
        zoomRef={zoomRef}
        onClose={review.close}
      >
        {total > 1 ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="media-navigation"
              className="left-1"
              aria-label={gt("Previous media")}
              onClick={() => review.step(-1)}
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="media-navigation"
              className="right-1"
              aria-label={gt("Next media")}
              onClick={() => review.step(1)}
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          </>
        ) : null}
      </ReviewStage>
      {before?.kind === "image" ? <ReviewPreload image={before} source={source} /> : null}
      {after?.kind === "image" ? <ReviewPreload image={after} source={source} /> : null}
      {total > 1 ? (
        <div
          className="flex shrink-0 justify-center gap-1.5 overflow-x-auto px-3 pb-3 max-md:pb-20"
          onClick={(event) => {
            if (event.target === event.currentTarget) review.close();
          }}
        >
          {thumbnails.map((thumbnail, offset) => (
            <ReviewThumbnail
              key={thumbnail.key}
              image={thumbnail}
              source={source}
              current={thumbStart + offset === index}
              position={thumbStart + offset + 1}
              total={total}
              onSelect={() => review.goTo(thumbStart + offset)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
