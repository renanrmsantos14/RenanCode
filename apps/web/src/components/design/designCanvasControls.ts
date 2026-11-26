export type DesignCanvasTool = "select" | "pan";
export type DesignCanvasMode = "design" | "preview";

export type DesignCanvasAction =
  | { readonly type: "tool"; readonly tool: DesignCanvasTool }
  | { readonly type: "mode"; readonly mode: DesignCanvasMode }
  | { readonly type: "addFrame" }
  | { readonly type: "zoomIn" }
  | { readonly type: "zoomOut" }
  | { readonly type: "fitAll" }
  | { readonly type: "fitSelection" }
  | { readonly type: "actualSize" }
  | { readonly type: "remove" }
  | { readonly type: "duplicate" }
  | { readonly type: "front" }
  | { readonly type: "back" }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "selectAll" }
  | { readonly type: "toggleFullScreen" }
  | { readonly type: "shortcuts" }
  | { readonly type: "escape" }
  | { readonly type: "nudge"; readonly dx: number; readonly dy: number };

type CanvasKeyEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "repeat"
>;

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The same keys as RenanDesign's canvas (`tips/hotkeys.ts` there), on the canvas that has focus. */
export function resolveDesignCanvasKey(
  event: CanvasKeyEvent,
  isMac: boolean,
): DesignCanvasAction | null {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  const otherModifier = isMac ? event.ctrlKey : event.metaKey;
  if (otherModifier || event.altKey) return null;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const action = mod ? modAction(key, event) : plainAction(key, event);
  if (action === null) return null;
  const repeats = action.type === "zoomIn" || action.type === "zoomOut" || action.type === "nudge";
  return event.repeat && !repeats ? null : action;
}

function modAction(key: string, event: CanvasKeyEvent): DesignCanvasAction | null {
  if (key === "=" || key === "+") return { type: "zoomIn" };
  if (key === "-") return { type: "zoomOut" };
  if (key === "0") return { type: "actualSize" };
  if (key === "z") return { type: event.shiftKey ? "redo" : "undo" };
  if (event.shiftKey) return null;
  if (key === "y") return { type: "redo" };
  if (key === "d") return { type: "duplicate" };
  if (key === "a") return { type: "selectAll" };
  if (key === "." || key === "\\") return { type: "toggleFullScreen" };
  if (key === "/") return { type: "shortcuts" };
  return null;
}

function plainAction(key: string, event: CanvasKeyEvent): DesignCanvasAction | null {
  const arrow = ARROWS[key];
  if (arrow !== undefined) {
    const step = event.shiftKey ? 10 : 1;
    return { type: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
  }
  if (event.shiftKey) {
    // Shift turns digits into symbols, so the physical key decides.
    if (event.code === "Digit1") return { type: "fitAll" };
    if (event.code === "Digit2") return { type: "fitSelection" };
    if (event.code === "Digit0") return { type: "actualSize" };
    if (event.code === "Equal" || key === "+") return { type: "zoomIn" };
    if (event.code === "Minus") return { type: "zoomOut" };
    return null;
  }
  switch (key) {
    case "v":
      return { type: "tool", tool: "select" };
    case "h":
      return { type: "tool", tool: "pan" };
    case "b":
      return { type: "addFrame" };
    case "d":
      return { type: "mode", mode: "design" };
    case "p":
      return { type: "mode", mode: "preview" };
    case "]":
      return { type: "front" };
    case "[":
      return { type: "back" };
    case "Delete":
    case "Backspace":
      return { type: "remove" };
    case "Escape":
      return { type: "escape" };
    default:
      return null;
  }
}

/** Keys shown in the shortcuts list, in `Kbd` notation; `mod` reads ⌘ on macOS and Ctrl elsewhere. */
export const DESIGN_CANVAS_SHORTCUT_GROUPS = [
  {
    id: "general",
    rows: [
      { id: "shortcuts", combos: ["mod+/"] },
      { id: "fullScreen", combos: ["mod+.", "mod+\\"] },
    ],
  },
  {
    id: "tools",
    rows: [
      { id: "select", combos: ["V"] },
      { id: "pan", combos: ["H", "Space", "Ctrl"] },
      { id: "addFrame", combos: ["B"] },
    ],
  },
  {
    id: "modes",
    rows: [
      { id: "design", combos: ["D"] },
      { id: "preview", combos: ["P"] },
    ],
  },
  {
    id: "edit",
    rows: [
      { id: "undo", combos: ["mod+Z"] },
      { id: "redo", combos: ["mod+shift+Z"] },
      { id: "duplicate", combos: ["mod+D"] },
      { id: "selectAll", combos: ["mod+A"] },
      { id: "front", combos: ["]"] },
      { id: "back", combos: ["["] },
      { id: "nudge", combos: ["←↑→↓", "shift+←↑→↓"] },
      { id: "remove", combos: ["⌫"] },
    ],
  },
  {
    id: "view",
    rows: [
      { id: "zoomIn", combos: ["mod+=", "shift++"] },
      { id: "zoomOut", combos: ["mod+−", "shift+−"] },
      { id: "fitAll", combos: ["shift+1"] },
      { id: "fitSelection", combos: ["shift+2"] },
      { id: "actualSize", combos: ["mod+0", "shift+0"] },
    ],
  },
] as const;
