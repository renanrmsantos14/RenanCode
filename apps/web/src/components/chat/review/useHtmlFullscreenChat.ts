import { Schema } from "effect";
import { useEffect, useState } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { useStableCallback } from "~/hooks/useStableCallback";
import { isCommandPaletteOpen } from "~/commandPaletteBus";
import { isContextMenuOpen } from "~/contextMenuFallback";
import { isEditableFocused } from "~/lib/editableFocus";
import type { ReviewSheetSnap } from "./useReviewMode";

const CHAT_HIDDEN_STORAGE_KEY = "t3code:html-fullscreen-chat-hidden";
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/**
 * The chat kept beside an HTML render opened full screen in the right panel: a column on wide
 * screens, a bottom sheet on narrow ones. Shaped like review mode so both share the chat layout.
 */
export function useHtmlFullscreenChat(active: boolean, onExit: () => void) {
  const [hidden, setHidden] = useLocalStorage(CHAT_HIDDEN_STORAGE_KEY, false, Schema.Boolean);
  const [sheet, setSheet] = useState<ReviewSheetSnap>("peek");
  const narrow = useMediaQuery("max-md");
  const chatHidden = hidden && !narrow;
  const onKeyDown = useStableCallback((event: KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (isContextMenuOpen() || isCommandPaletteOpen() || isEditableFocused()) return;
    if (event.target instanceof Element && event.target.closest(DIALOG_SELECTOR)) return;
    event.preventDefault();
    onExit();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- document key listener so Escape leaves full screen
  useEffect(() => {
    if (!active) return;
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onKeyDown]);
  return {
    active,
    /** The chat column is on screen, so it must not collapse with the maximized panel. */
    shown: active && !chatHidden,
    narrow,
    chatHidden,
    sheet,
    setSheet,
    toggleChat: () => setHidden((value) => !value),
  };
}
