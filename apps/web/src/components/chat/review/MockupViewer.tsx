import { htmlVariantChoiceTag, htmlVariantLetter } from "@t3tools/shared/htmlRender";
import type { HtmlVariantReference } from "@t3tools/shared/htmlRender";
import { T, useGT } from "gt-react";
import { PanelRightCloseIcon, PanelRightOpenIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { isCommandPaletteOpen } from "../../../commandPaletteBus";
import { isContextMenuOpen } from "../../../contextMenuFallback";
import { useStableCallback } from "../../../hooks/useStableCallback";
import { isEditableFocused } from "../../../lib/editableFocus";
import { cn } from "../../../lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../../workspaceTitlebar";
import { Button } from "../../ui/button";
import type { MockupViewer as MockupViewerState } from "./useMockupViewer";

// Arrow keys belong to widgets that use them to move between options.
const ARROW_OWNER_SELECTOR =
  '[role="radiogroup"], [role="listbox"], [role="menu"], [role="tablist"]';
const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/** Keeps the current option's letter and thumbnail in view in their scrolling strips. */
function keepInView(element: HTMLElement | null) {
  element?.scrollIntoView({ inline: "nearest", block: "nearest" });
}

// Focus leaves the control that opened the viewer, which may sit in a widget that owns the arrows.
function focusOnMount(element: HTMLElement | null) {
  element?.focus({ preventScroll: true });
}

/** The widest a page is written for; the stage stops growing there and centers. */
const STAGE_MAX_WIDTH_PX = 1176;

/**
 * The mockup side of the live viewer: it fills the area the chat column leaves free and shows one
 * option at a time. Only the open option is mounted, so only one page runs at once.
 */
export function MockupViewer({
  viewer,
  renderPage,
  onChoose,
}: {
  readonly viewer: MockupViewerState;
  /** Draws the open option as a live page that fills its box. */
  readonly renderPage: (variant: HtmlVariantReference, index: number) => ReactNode;
  /** Puts the choice in the composer without sending it; unset, the viewer has no choose button. */
  readonly onChoose?: ((text: string) => boolean) | undefined;
}) {
  const gt = useGT();
  const { variants, index } = viewer;
  const variant = variants[index];
  const onKeyDown = useStableCallback((event: KeyboardEvent) => {
    // The composer swallows Escape; it still closes the viewer unless a menu in it is open.
    const composerEscape =
      event.key === "Escape" &&
      event.target instanceof Element &&
      event.target.closest(".composer-tiptap") !== null &&
      document.querySelector('[role="listbox"], [role="menu"]') === null;
    if (
      (event.defaultPrevented && !composerEscape) ||
      isContextMenuOpen() ||
      isCommandPaletteOpen()
    ) {
      return;
    }
    // A dialog over the viewer owns Escape and the arrow keys.
    if (event.target instanceof Element && event.target.closest(DIALOG_SELECTOR)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      viewer.close();
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditableFocused() || document.activeElement instanceof HTMLIFrameElement) return;
    if (event.target instanceof Element && event.target.closest(ARROW_OWNER_SELECTOR)) return;
    event.preventDefault();
    viewer.step(event.key === "ArrowLeft" ? -1 : 1);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- document key listener for Esc and the arrow keys while the viewer is open
  useEffect(() => {
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  if (!variant) return null;
  const letter = htmlVariantLetter(index);
  const ChatToggleIcon = viewer.chatHidden ? PanelRightOpenIcon : PanelRightCloseIcon;
  const chatToggleLabel = viewer.chatHidden ? gt("Show chat") : gt("Hide chat");

  return (
    <section
      ref={focusOnMount}
      tabIndex={-1}
      aria-label={gt("Mockup viewer")}
      className="relative flex outline-none min-h-0 min-w-0 flex-1 flex-col bg-muted/40 text-foreground"
    >
      <div
        className={cn(
          "drag-region flex min-h-(--workspace-topbar-height) shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-background px-3 max-md:py-1",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          (viewer.chatHidden || viewer.narrow) && "wco:pr-(--workspace-native-controls-inset)",
        )}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={gt("Close mockup viewer")}
          onClick={viewer.close}
        >
          <XIcon aria-hidden="true" />
          <T>Close</T>
        </Button>
        <div
          role="group"
          aria-label={gt("Options")}
          className="flex max-w-full min-w-0 gap-1 overflow-x-auto max-md:order-last max-md:basis-full md:max-w-[45%]"
        >
          {variants.map((option, optionIndex) => (
            <Button
              key={option.attachmentId}
              type="button"
              size="icon-xs"
              variant={optionIndex === index ? "default" : "outline"}
              className="shrink-0"
              title={option.label}
              aria-label={gt("Show {variant}", { variant: option.label })}
              aria-current={optionIndex === index ? "true" : undefined}
              ref={optionIndex === index ? keepInView : undefined}
              onClick={() => viewer.goTo(optionIndex)}
            >
              {htmlVariantLetter(optionIndex)}
            </Button>
          ))}
        </div>
        <p className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground">
          <span aria-live="polite" aria-atomic="true">
            {variant.title}
          </span>
          <span className="ml-2 tabular-nums">{`${letter} · ${variant.label}`}</span>
        </p>
        {onChoose ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const tag = htmlVariantChoiceTag(index, variant.label).trimEnd();
              const inserted = onChoose(`${gt("I chose {choice}", { choice: tag })} `);
              if (inserted && viewer.narrow) viewer.setSheet("half");
            }}
          >
            {gt("Choose {letter}", { letter })}
          </Button>
        ) : null}
        {viewer.narrow ? null : (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={chatToggleLabel}
            aria-pressed={viewer.chatHidden}
            onClick={viewer.toggleChat}
          >
            <ChatToggleIcon aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 px-4 py-3 max-md:px-2">
        <div
          key={variant.attachmentId}
          className="mx-auto size-full overflow-hidden rounded-lg border bg-background shadow-sm"
          style={{ maxWidth: STAGE_MAX_WIDTH_PX }}
        >
          {renderPage(variant, index)}
        </div>
      </div>
      <div
        role="group"
        aria-label={gt("Option thumbnails")}
        className="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-3 max-md:pb-20"
      >
        {variants.map((option, optionIndex) => (
          <button
            key={option.attachmentId}
            type="button"
            aria-current={optionIndex === index ? "true" : undefined}
            ref={optionIndex === index ? keepInView : undefined}
            onClick={() => viewer.goTo(optionIndex)}
            className={cn(
              "flex h-12 w-28 shrink-0 flex-col items-start justify-center rounded-md border bg-background px-2 text-left outline-none ring-2 ring-offset-0 focus-visible:ring-ring",
              optionIndex === index
                ? "ring-primary"
                : "opacity-70 ring-transparent hover:opacity-100",
            )}
          >
            <span className="font-semibold text-sm leading-none">
              {htmlVariantLetter(optionIndex)}
            </span>
            <span className="mt-1 w-full truncate text-muted-foreground text-xs leading-none">
              {option.label}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
