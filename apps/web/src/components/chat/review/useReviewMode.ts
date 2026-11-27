import { useAtomValue } from "@effect/atom-react";
import { Schema } from "effect";
import { Atom } from "effect/reactivity";
import { createContext, useEffect, useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useStableCallback } from "~/hooks/useStableCallback";
import { useTheme } from "~/hooks/useTheme";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import type { ExpandedImagePreview } from "../ExpandedImagePreview";
import { registerThreadOverlay } from "../threadOverlayRetention";
import {
  deriveReviewGallery,
  findReviewIndex,
  reviewItemsFromPreview,
  type ReviewGalleryEntry,
  type ReviewItem,
  type ReviewSourceContext,
} from "./reviewGallery";

export type ReviewSheetSnap = "peek" | "half" | "full";

export const CHAT_HIDDEN_STORAGE_KEY = "t3code:review-chat-hidden";

interface ReviewState {
  /** The thread the review was opened in; leaving it ends the review. */
  readonly scope: string | null;
  readonly key: string;
  /** Frozen at the click; null follows the thread's gallery. */
  readonly items: ReadonlyArray<ReviewItem> | null;
}

export interface ReviewReveal {
  readonly scope: string | null;
  readonly rowId: string;
  readonly ordinal: number;
  readonly nonce: number;
}

const reviewStateAtom = Atom.make<ReviewState | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("chat:review"),
);
// Undefined while closed; read alone so a step through the gallery does not re-render the chat.
const reviewScopeAtom = Atom.make((get) => get(reviewStateAtom)?.scope).pipe(
  Atom.withLabel("chat:review-scope"),
);
const reviewRevealAtom = Atom.make<ReviewReveal | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("chat:review-reveal"),
);

function ownedSrcs(state: ReviewState | null): ReadonlySet<string> {
  return new Set(state?.items?.flatMap((item) => (item.ownsSrc && item.src ? [item.src] : [])));
}

function setReviewState(next: ReviewState | null): void {
  const previous = ownedSrcs(appAtomRegistry.get(reviewStateAtom));
  appAtomRegistry.set(reviewStateAtom, next);
  if (next === null) appAtomRegistry.set(reviewRevealAtom, null);
  const kept = ownedSrcs(next);
  for (const src of previous) if (!kept.has(src)) URL.revokeObjectURL(src);
}

function closeReview(): void {
  setReviewState(null);
}

/** Ends review only when it belongs to `scope`. */
export function closeReviewIn(scope: string | null): void {
  if (appAtomRegistry.get(reviewStateAtom)?.scope === scope) closeReview();
}

registerThreadOverlay((threadKey) => {
  const current = appAtomRegistry.get(reviewStateAtom);
  if (current !== null && current.scope !== threadKey) closeReview();
});

/**
 * Opens `preview` in review inside `gallery`; false when it is not there. `frozen` keeps that
 * gallery as it was at the click instead of following the thread.
 */
function openReview(input: {
  readonly scope: string | null;
  readonly preview: ExpandedImagePreview;
  readonly gallery: ReadonlyArray<ReviewItem>;
  readonly frozen: boolean;
  readonly source: ReviewSourceContext;
}): boolean {
  const found = input.gallery[findReviewIndex(input.gallery, input.preview, input.source)];
  if (!found) return false;
  setReviewState({
    scope: input.scope,
    key: found.key,
    items: input.frozen ? input.gallery : null,
  });
  return true;
}

/** Opens `preview` in review as its own list. */
function openLooseReview(scope: string | null, preview: ExpandedImagePreview): void {
  const items = reviewItemsFromPreview(preview);
  const shown = items[preview.index] ?? items[0];
  if (shown) setReviewState({ scope, key: shown.key, items });
}

export type OpenMedia = (
  preview: ExpandedImagePreview,
  options?: {
    /** The entries the click came from, when they are fuller than the thread's timeline. */
    readonly entries?: ReadonlyArray<ReviewGalleryEntry>;
  },
) => void;

/** Opens media in review mode; the chat provides it, and outside one the media opens alone. */
export const MediaReviewContext = createContext<OpenMedia>((preview) =>
  openLooseReview(null, preview),
);

/** The opener a thread view provides through `MediaReviewContext`. */
export function useThreadOpenMedia(input: {
  readonly scope: string | null;
  readonly entries: ReadonlyArray<ReviewGalleryEntry>;
  readonly source: ReviewSourceContext;
  readonly onBeforeOpen?: () => void;
  /** Takes media outside the thread's gallery; by default it opens alone. */
  readonly onMissing?: (preview: ExpandedImagePreview) => void;
}): OpenMedia {
  const { resolvedTheme } = useTheme();
  return useStableCallback((preview, options) => {
    input.onBeforeOpen?.();
    const context = { cwd: input.source.cwd, theme: resolvedTheme };
    const opened = openReview({
      scope: input.scope,
      preview,
      gallery: deriveReviewGallery(options?.entries ?? input.entries, context),
      frozen: options?.entries !== undefined,
      source: input.source,
    });
    if (opened) return;
    if (input.onMissing) input.onMissing(preview);
    else openLooseReview(input.scope, preview);
  });
}

/** Whether review is open for `scope`; it changes only when review opens or closes. */
function useReviewOpen(scope: string | null): boolean {
  return useAtomValue(reviewScopeAtom) === scope;
}

/** Calls `onReveal` each time review moves to an item of `scope`'s chat. */
export function useReviewReveal(
  scope: string | null,
  onReveal: (reveal: ReviewReveal) => void,
): void {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the review store, outside React, without re-rendering the timeline on each step
  useEffect(
    () =>
      appAtomRegistry.subscribe(reviewRevealAtom, (reveal) => {
        if (reveal?.scope === scope) onReveal(reveal);
      }),
    [scope, onReveal],
  );
}

export interface ReviewGallery {
  readonly images: ReadonlyArray<ReviewItem>;
  readonly index: number;
  readonly goTo: (index: number) => void;
  readonly step: (direction: -1 | 1) => void;
}

const NO_IMAGES: ReadonlyArray<ReviewItem> = [];

/** The items shown in `scope`'s review and the current one. */
export function useReviewGallery(input: {
  readonly scope: string | null;
  readonly entries: ReadonlyArray<ReviewGalleryEntry>;
  readonly source: ReviewSourceContext;
}): ReviewGallery {
  const stored = useAtomValue(reviewStateAtom);
  const { resolvedTheme } = useTheme();
  const state = stored?.scope === input.scope ? stored : null;
  const images =
    state === null
      ? NO_IMAGES
      : (state.items ??
        deriveReviewGallery(input.entries, { cwd: input.source.cwd, theme: resolvedTheme }));
  // -1 once the item leaves the thread's gallery (a reverted turn, for one).
  const index = images.findIndex((image) => image.key === state?.key);
  const goTo = (next: number) => {
    const image = images[next];
    if (!image || state === null) return;
    setReviewState({ ...state, key: image.key });
    const { rowId } = image;
    if (rowId === null) return;
    const previous = appAtomRegistry.get(reviewRevealAtom);
    appAtomRegistry.set(reviewRevealAtom, {
      scope: state.scope,
      rowId,
      ordinal: image.ordinal,
      nonce: (previous?.nonce ?? 0) + 1,
    });
  };
  return {
    images,
    index,
    goTo,
    step: (direction) => {
      if (images.length > 1) goTo((index + direction + images.length) % images.length);
    },
  };
}

export interface ReviewMode {
  readonly active: boolean;
  readonly narrow: boolean;
  readonly chatHidden: boolean;
  readonly sheet: ReviewSheetSnap;
  readonly close: () => void;
  readonly toggleChat: () => void;
  readonly setSheet: (snap: ReviewSheetSnap) => void;
}

/**
 * Review mode's layout for `scope`: the media in a viewer, with the chat kept beside it. Both the
 * guest page and the owner's chat use it; the caller lays out the viewer and the chat column.
 */
export function useReviewMode(scope: string | null): ReviewMode {
  const active = useReviewOpen(scope);
  const [chatHidden, setChatHidden] = useLocalStorage(
    CHAT_HIDDEN_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const [sheet, setSheet] = useState<ReviewSheetSnap>("peek");
  const [wasActive, setWasActive] = useState(active);
  const narrow = useMediaQuery("max-md");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the store outlives the view, so a side chat closed mid-review must not reopen it later
  useEffect(() => () => closeReviewIn(scope), [scope]);
  if (wasActive !== active) {
    setWasActive(active);
    if (active) setSheet("peek");
  }
  return {
    active,
    narrow,
    chatHidden: chatHidden && !narrow,
    sheet,
    close: closeReview,
    toggleChat: () => setChatHidden((hidden) => !hidden),
    setSheet,
  };
}
