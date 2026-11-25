import { describe, expect, it } from "vite-plus/test";

import { resolveDesignCanvasKey } from "./designCanvasControls";

const key = (
  value: string,
  init: Partial<{
    code: string;
    shiftKey: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    repeat: boolean;
  }> = {},
) => ({
  key: value,
  code: init.code ?? "",
  shiftKey: init.shiftKey ?? false,
  altKey: init.altKey ?? false,
  ctrlKey: init.ctrlKey ?? false,
  metaKey: init.metaKey ?? false,
  repeat: init.repeat ?? false,
});

describe("resolveDesignCanvasKey", () => {
  it("reads the platform modifier: Cmd on macOS, Ctrl elsewhere", () => {
    expect(resolveDesignCanvasKey(key("z", { metaKey: true }), true)).toEqual({ type: "undo" });
    expect(resolveDesignCanvasKey(key("z", { ctrlKey: true }), false)).toEqual({ type: "undo" });
    expect(resolveDesignCanvasKey(key("z", { ctrlKey: true }), true)).toBeNull();
    expect(resolveDesignCanvasKey(key("Z", { ctrlKey: true, shiftKey: true }), false)).toEqual({
      type: "redo",
    });
    expect(resolveDesignCanvasKey(key("d", { ctrlKey: true }), false)).toEqual({
      type: "duplicate",
    });
  });

  it("maps the single-letter tools and modes", () => {
    expect(resolveDesignCanvasKey(key("v"), false)).toEqual({ type: "tool", tool: "select" });
    expect(resolveDesignCanvasKey(key("H"), false)).toEqual({ type: "tool", tool: "pan" });
    expect(resolveDesignCanvasKey(key("b"), false)).toEqual({ type: "addFrame" });
    expect(resolveDesignCanvasKey(key("d"), false)).toEqual({ type: "mode", mode: "design" });
    expect(resolveDesignCanvasKey(key("p"), false)).toEqual({ type: "mode", mode: "preview" });
  });

  it("nudges 1px, or 10px with Shift, and lets arrows repeat", () => {
    expect(resolveDesignCanvasKey(key("ArrowLeft"), false)).toEqual({
      type: "nudge",
      dx: -1,
      dy: 0,
    });
    expect(
      resolveDesignCanvasKey(key("ArrowDown", { shiftKey: true, repeat: true }), false),
    ).toEqual({ type: "nudge", dx: 0, dy: 10 });
  });

  it("reads Shift+digit by physical key", () => {
    expect(resolveDesignCanvasKey(key("!", { shiftKey: true, code: "Digit1" }), false)).toEqual({
      type: "fitAll",
    });
    expect(resolveDesignCanvasKey(key("@", { shiftKey: true, code: "Digit2" }), false)).toEqual({
      type: "fitSelection",
    });
  });

  it("ignores repeats of one-shot keys and Alt chords", () => {
    expect(resolveDesignCanvasKey(key("Delete", { repeat: true }), false)).toBeNull();
    expect(resolveDesignCanvasKey(key("v", { altKey: true }), false)).toBeNull();
    expect(resolveDesignCanvasKey(key("x"), false)).toBeNull();
  });
});
