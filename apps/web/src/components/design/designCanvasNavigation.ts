import { useReactFlow } from "@xyflow/react";
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { isEditableFocused } from "~/lib/editableFocus";

/** Only this canvas's own surface: another canvas on screen has its own hook. */
function isOnCanvas(target: EventTarget | null, root: HTMLElement | null): boolean {
  return (
    target instanceof Element &&
    root !== null &&
    target.closest("[data-design-canvas]") === root &&
    target.closest(".nopan") === null
  );
}

/**
 * RenanDesign's navigation: the wheel pans and ⌘ held turns it into zoom (a trackpad pinch,
 * a Ctrl wheel, always zooms); Space or a lone Ctrl held is the hand, and Ctrl-drag pans.
 */
export function useDesignCanvasNavigation(
  root: RefObject<HTMLElement | null>,
  onPanEnd: () => void,
): {
  readonly panHeld: boolean;
  readonly zoomHeld: boolean;
} {
  const flow = useReactFlow();
  const [panHeld, setPanHeld] = useState(false);
  const [zoomHeld, setZoomHeld] = useState(false);
  const held = useRef(false);
  const panEnded = useEffectEvent(onPanEnd);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window key, pointer and wheel listeners that track the held modifiers and drive the Ctrl-drag pan
  useEffect(() => {
    const controller = new AbortController();
    const capture = { capture: true, signal: controller.signal };
    const setPan = (next: boolean) => {
      if (held.current === next) return;
      held.current = next;
      setPanHeld(next);
    };
    let zoom = false;
    // Commits before React Flow's wheel listener reads the zoom/pan props (RenanDesign ONL-2890).
    const setZoom = (next: boolean) => {
      if (zoom === next) return;
      zoom = next;
      flushSync(() => setZoomHeld(next));
    };
    let drag: { x: number; y: number; pointerId: number } | null = null;
    let moved = false;
    let swallowClick = false;
    const isCtrlPress = (event: MouseEvent) =>
      event.button === 0 && event.ctrlKey && held.current && isOnCanvas(event.target, root.current);
    const stop = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener(
      "keydown",
      (event) => {
        setZoom(event.metaKey);
        if (event.repeat) return;
        if (event.key === "Control") {
          if (!event.shiftKey && !event.metaKey && !event.altKey) setPan(true);
          return;
        }
        // A Ctrl chord is a shortcut, not a pan.
        if (event.ctrlKey) setPan(false);
        else if (event.code === "Space" && !isEditableFocused(event.target)) setPan(true);
      },
      capture,
    );
    window.addEventListener(
      "keyup",
      (event) => {
        setZoom(event.key !== "Meta" && event.metaKey);
        if (event.code === "Space" || event.key === "Control") setPan(false);
      },
      capture,
    );
    window.addEventListener("wheel", (event) => setZoom(event.metaKey), {
      ...capture,
      passive: true,
    });
    // A keyup delivered to another window never arrives.
    window.addEventListener(
      "blur",
      () => {
        setPan(false);
        setZoom(false);
        drag = null;
      },
      { signal: controller.signal },
    );

    window.addEventListener(
      "pointerdown",
      (event) => {
        setZoom(event.metaKey);
        if (!isCtrlPress(event)) return;
        stop(event);
        drag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        moved = false;
      },
      capture,
    );
    // d3-zoom rejects a Ctrl press, and React Flow would start a marquee from the mousedown.
    window.addEventListener(
      "mousedown",
      (event) => {
        if (drag !== null || isCtrlPress(event)) stop(event);
      },
      capture,
    );
    // On macOS a Ctrl press is also a secondary click, which would open the pane menu.
    window.addEventListener(
      "contextmenu",
      (event) => {
        if (drag !== null || isCtrlPress(event)) stop(event);
      },
      capture,
    );
    window.addEventListener(
      "click",
      (event) => {
        if (!swallowClick) return;
        swallowClick = false;
        stop(event);
      },
      capture,
    );
    window.addEventListener(
      "pointermove",
      (event) => {
        setZoom(event.metaKey);
        if (drag === null || event.pointerId !== drag.pointerId) return;
        // A release over a Frame's page never reaches this window.
        if ((event.buttons & 1) === 0) {
          drag = null;
          return;
        }
        moved = true;
        const viewport = flow.getViewport();
        void flow.setViewport({
          ...viewport,
          x: viewport.x + event.clientX - drag.x,
          y: viewport.y + event.clientY - drag.y,
        });
        drag = { ...drag, x: event.clientX, y: event.clientY };
      },
      capture,
    );
    const end = (event: PointerEvent) => {
      if (drag === null || event.pointerId !== drag.pointerId) return;
      drag = null;
      if (!moved) return;
      panEnded();
      swallowClick = true;
      setTimeout(() => (swallowClick = false));
    };
    window.addEventListener("pointerup", end, capture);
    window.addEventListener("pointercancel", end, capture);
    return () => controller.abort();
  }, [flow, root]);

  return { panHeld, zoomHeld };
}
