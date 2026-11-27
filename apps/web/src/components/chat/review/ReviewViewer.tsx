import { T, useGT } from "gt-react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useAssetUrlState } from "../../../assets/assetUrls";
import { isCommandPaletteOpen } from "../../../commandPaletteBus";
import { isContextMenuOpen } from "../../../contextMenuFallback";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { isEditableFocused } from "../../../lib/editableFocus";
import { cn } from "../../../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../../workspaceTitlebar";
import { MediaActions } from "../../media/MediaActions";
import { Button } from "../../ui/button";
import { reviewImageTarget, type ReviewImage, type ReviewSourceContext } from "./reviewGallery";
import type { ReviewMode } from "./useReviewMode";
import { ARROW_OWNER_SELECTOR, DIALOG_SELECTOR } from "./viewerKeys";

export interface ReviewImageSource extends ReviewSourceContext {
  readonly threadRef: {
    readonly environmentId: EnvironmentId;
    readonly threadId: ThreadId;
  } | null;
}

const THUMBNAIL_WINDOW = 4;

function useReviewImageUrl(
  image: ReviewImage,
  source: ReviewImageSource,
): { readonly url: string | null; readonly failed: boolean } {
  const target = reviewImageTarget(image, source);
  const asset =
    target?._tag === "workspace" && source.threadRef
      ? {
          environmentId: source.threadRef.environmentId,
          resource: {
            _tag: "media-file" as const,
            threadId: source.threadRef.threadId,
            path: target.path,
            ...(target.relative ? { hostOnly: true as const } : {}),
          },
        }
      : null;
  const state = useAssetUrlState(asset?.environmentId ?? null, asset?.resource ?? null);
  if (target?._tag === "direct") return { url: target.src, failed: false };
  if (asset === null) return { url: null, failed: true };
  return state._tag === "Success"
    ? { url: state.url, failed: false }
    : { url: null, failed: state._tag === "Failure" };
}

function ReviewStageImage({
  image,
  source,
}: {
  readonly image: ReviewImage;
  readonly source: ReviewImageSource;
}) {
  const gt = useGT();
  const { url, failed } = useReviewImageUrl(image, source);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failed || (url !== null && failedUrl === url)) {
    return (
      <p role="alert" className="text-sm text-white/80">
        {gt("Image unavailable. The file may have been moved or deleted.")}
      </p>
    );
  }
  if (url === null) return <p className="text-sm text-white/60">{gt("Loading image...")}</p>;
  return (
    <MediaActions source={{ kind: "image", name: image.name, src: url }} showTooltip={false}>
      <img
        key={url}
        src={url}
        alt={image.name}
        decoding="async"
        draggable={false}
        className="max-h-full max-w-full object-contain"
        onError={() => setFailedUrl(url)}
      />
    </MediaActions>
  );
}

function ReviewPreload({
  image,
  source,
}: {
  readonly image: ReviewImage;
  readonly source: ReviewImageSource;
}) {
  const { url } = useReviewImageUrl(image, source);
  return url === null ? null : <img src={url} alt="" decoding="async" hidden />;
}

function ReviewThumbnail({
  image,
  source,
  current,
  position,
  total,
  onSelect,
}: {
  readonly image: ReviewImage;
  readonly source: ReviewImageSource;
  readonly current: boolean;
  readonly position: number;
  readonly total: number;
  readonly onSelect: () => void;
}) {
  const gt = useGT();
  const { url } = useReviewImageUrl(image, source);
  return (
    <button
      type="button"
      aria-label={gt("Show image {position} of {total}", { position, total })}
      aria-current={current ? "true" : undefined}
      onClick={onSelect}
      className={cn(
        "size-12 shrink-0 overflow-hidden rounded-md bg-white/10 ring-2 ring-offset-0 outline-none focus-visible:ring-white",
        current ? "ring-white" : "opacity-60 ring-transparent hover:opacity-100",
      )}
    >
      {url === null ? null : (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover"
        />
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
  const onKeyDown = useStableCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || isContextMenuOpen() || isCommandPaletteOpen()) return;
    // A dialog over the review owns Escape and the arrow keys.
    if (event.target instanceof Element && event.target.closest(DIALOG_SELECTOR)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      review.close();
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

  if (!image) return null;
  const before = images[index - 1];
  const after = images[index + 1];
  const thumbStart = Math.max(0, index - THUMBNAIL_WINDOW);
  const thumbnails = images.slice(thumbStart, index + THUMBNAIL_WINDOW + 1);
  const ChatToggleIcon = review.chatHidden ? PanelRightOpenIcon : PanelRightCloseIcon;
  const chatToggleLabel = review.chatHidden ? gt("Show chat") : gt("Hide chat");

  return (
    <section
      aria-label={gt("Image review")}
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
          aria-label={gt("Close image review")}
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
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-12 pb-2 max-md:px-2"
        onClick={(event) => {
          if (event.target === event.currentTarget) review.close();
        }}
      >
        <ReviewStageImage key={image.key} image={image} source={source} />
        {total > 1 ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="media-navigation"
              className="left-1"
              aria-label={gt("Previous image")}
              onClick={() => review.step(-1)}
            >
              <ChevronLeftIcon className="size-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="media-navigation"
              className="right-1"
              aria-label={gt("Next image")}
              onClick={() => review.step(1)}
            >
              <ChevronRightIcon className="size-5" />
            </Button>
          </>
        ) : null}
      </div>
      {before ? <ReviewPreload image={before} source={source} /> : null}
      {after ? <ReviewPreload image={after} source={source} /> : null}
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
