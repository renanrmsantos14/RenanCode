import { Schema } from "effect";
import { useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useTheme } from "~/hooks/useTheme";
import type { ExpandedImagePreview } from "../ExpandedImagePreview";
import {
  deriveReviewGallery,
  findReviewIndex,
  type ReviewGalleryEntry,
  type ReviewImage,
  type ReviewSourceContext,
} from "./reviewGallery";

export type ReviewSheetSnap = "peek" | "half" | "full";

export const CHAT_HIDDEN_STORAGE_KEY = "t3code:review-chat-hidden";

interface ReviewState {
  /** The thread the review was opened in; leaving it ends the review. */
  readonly scope: string | null;
  readonly key: string;
  /** The gallery of the clicked timeline, frozen at the click; null follows `entries`. */
  readonly snapshot: ReadonlyArray<ReviewImage> | null;
}

export interface ReviewReveal {
  readonly rowId: string;
  readonly ordinal: number;
  readonly nonce: number;
}

export interface ReviewMode {
  readonly active: boolean;
  readonly images: ReadonlyArray<ReviewImage>;
  readonly index: number;
  readonly narrow: boolean;
  readonly chatHidden: boolean;
  readonly sheet: ReviewSheetSnap;
  /** The image to bring into view in the chat; a new `nonce` asks again for the same one. */
  readonly reveal: ReviewReveal | null;
  /** Opens the review of a clicked image; false when the thread has no such image. */
  readonly open: (
    preview: ExpandedImagePreview,
    /** The entries the click came from, when they are fuller than `entries`. */
    clickedEntries?: ReadonlyArray<ReviewGalleryEntry>,
  ) => boolean;
  readonly close: () => void;
  readonly goTo: (index: number) => void;
  readonly step: (direction: -1 | 1) => void;
  readonly toggleChat: () => void;
  readonly setSheet: (snap: ReviewSheetSnap) => void;
}

const NO_IMAGES: ReadonlyArray<ReviewImage> = [];

/**
 * Review mode: the thread's images in a viewer, with the chat kept beside it. Both the guest page
 * and the owner's chat use it; the caller lays out the viewer and the chat column from the result.
 */
export function useReviewMode(input: {
  readonly scope: string | null;
  readonly entries: ReadonlyArray<ReviewGalleryEntry>;
  readonly source: ReviewSourceContext;
}): ReviewMode {
  const [stored, setState] = useState<ReviewState | null>(null);
  const [chatHidden, setChatHidden] = useLocalStorage(
    CHAT_HIDDEN_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const [sheet, setSheet] = useState<ReviewSheetSnap>("peek");
  const [reveal, setReveal] = useState<ReviewMode["reveal"]>(null);
  const narrow = useMediaQuery("max-md");
  // Leaving the thread ends its review, so coming back does not reopen it.
  if (stored !== null && stored.scope !== input.scope) {
    setState(null);
    setReveal(null);
  }
  const state = stored?.scope === input.scope ? stored : null;
  const { resolvedTheme } = useTheme();
  const galleryContext = { cwd: input.source.cwd, theme: resolvedTheme };

  const images =
    state === null
      ? NO_IMAGES
      : (state.snapshot ?? deriveReviewGallery(input.entries, galleryContext));
  const found = state === null ? -1 : images.findIndex((image) => image.key === state.key);
  const index = Math.max(0, found);
  const active = state !== null && images.length > 0;

  const select = (next: number, shown: ReadonlyArray<ReviewImage>) => {
    const image = shown[next];
    if (!image) return;
    setState((current) => (current ? { ...current, key: image.key } : current));
    setReveal((current) => ({
      rowId: image.rowId,
      ordinal: image.ordinal,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  };

  return {
    active,
    images,
    index,
    narrow,
    chatHidden: chatHidden && !narrow,
    sheet,
    reveal,
    open: (preview, clickedEntries) => {
      const snapshot = clickedEntries ? deriveReviewGallery(clickedEntries, galleryContext) : null;
      const shown = snapshot ?? deriveReviewGallery(input.entries, galleryContext);
      const image = shown[findReviewIndex(shown, preview, input.source)];
      if (!image) return false;
      setState({ scope: input.scope, key: image.key, snapshot });
      setSheet("peek");
      return true;
    },
    close: () => {
      setState(null);
      setReveal(null);
    },
    goTo: (next) => select(next, images),
    step: (direction) => {
      if (images.length > 1) select((index + direction + images.length) % images.length, images);
    },
    toggleChat: () => setChatHidden((hidden) => !hidden),
    setSheet,
  };
}
