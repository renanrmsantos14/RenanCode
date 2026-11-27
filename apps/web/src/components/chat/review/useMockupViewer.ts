import type { HtmlVariantReference } from "@t3tools/shared/htmlRender";
import { Schema } from "effect";
import { useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import type { ReviewSheetSnap } from "./useReviewMode";

// The same preference as image review: both viewers lay out the chat the same way.
const CHAT_HIDDEN_STORAGE_KEY = "t3code:review-chat-hidden";

interface MockupViewerState {
  /** The thread the viewer was opened in; leaving it ends the viewer. */
  readonly scope: string | null;
  readonly rowId: string;
  /** The options of the clicked block, frozen at the click. */
  readonly variants: ReadonlyArray<HtmlVariantReference>;
  readonly index: number;
}

export interface MockupViewer {
  readonly active: boolean;
  readonly rowId: string | null;
  readonly variants: ReadonlyArray<HtmlVariantReference>;
  readonly index: number;
  readonly narrow: boolean;
  readonly chatHidden: boolean;
  readonly sheet: ReviewSheetSnap;
  readonly open: (
    rowId: string,
    variants: ReadonlyArray<HtmlVariantReference>,
    index: number,
  ) => void;
  readonly close: () => void;
  readonly goTo: (index: number) => void;
  readonly step: (direction: -1 | 1) => void;
  readonly toggleChat: () => void;
  readonly setSheet: (snap: ReviewSheetSnap) => void;
}

const NO_VARIANTS: ReadonlyArray<HtmlVariantReference> = [];

/**
 * The live viewer of an html_variants block: one option at a time, large and interactive, with the
 * chat kept beside it. Shaped like image review so both share the chat column layout.
 */
export function useMockupViewer(input: { readonly scope: string | null }): MockupViewer {
  const [stored, setState] = useState<MockupViewerState | null>(null);
  const [chatHidden, setChatHidden] = useLocalStorage(
    CHAT_HIDDEN_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const [sheet, setSheet] = useState<ReviewSheetSnap>("peek");
  const narrow = useMediaQuery("max-md");
  // Leaving the thread ends its viewer, so coming back does not reopen it.
  if (stored !== null && stored.scope !== input.scope) setState(null);
  const state = stored?.scope === input.scope ? stored : null;
  const variants = state?.variants ?? NO_VARIANTS;
  const index = state === null ? 0 : Math.min(state.index, Math.max(0, variants.length - 1));
  const goTo = (next: number) =>
    setState((current) =>
      current && next >= 0 && next < current.variants.length
        ? { ...current, index: next }
        : current,
    );

  return {
    active: state !== null && variants.length > 0,
    rowId: state?.rowId ?? null,
    variants,
    index,
    narrow,
    chatHidden: chatHidden && !narrow,
    sheet,
    open: (rowId, opened, at) => {
      if (opened.length === 0) return;
      setState({ scope: input.scope, rowId, variants: opened, index: at });
      setSheet("peek");
    },
    close: () => setState(null),
    goTo,
    step: (direction) => {
      if (variants.length > 1) goTo((index + direction + variants.length) % variants.length);
    },
    toggleChat: () => setChatHidden((hidden) => !hidden),
    setSheet,
  };
}
