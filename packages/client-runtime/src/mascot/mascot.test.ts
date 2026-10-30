import { describe, expect, it } from "vite-plus/test";

import {
  deriveMascotState,
  MASCOT_GESTURES,
  MASCOT_MANIFEST,
  mascotGestureDelayMs,
  pickMascotGesture,
  type MascotInput,
} from "./mascot.ts";

const base: MascotInput = {
  connectionPhase: "connected",
  hasThread: true,
  hasPendingRequest: false,
  runStatus: null,
  hasVisibleError: false,
  justCompleted: false,
};

describe("deriveMascotState", () => {
  it.each([
    [
      "offline wins over everything",
      { connectionPhase: "offline", hasPendingRequest: true, runStatus: "running" },
      "offline",
    ],
    ["reconnecting sleeps too", { connectionPhase: "reconnecting" }, "offline"],
    [
      "pending request beats a running turn",
      { hasPendingRequest: true, runStatus: "running" },
      "needsYou",
    ],
    [
      "visible error beats a starting turn",
      { hasVisibleError: true, runStatus: "starting" },
      "error",
    ],
    ["preparing is thinking", { runStatus: "preparing" }, "thinking"],
    ["queued is thinking", { runStatus: "queued" }, "thinking"],
    ["starting is thinking", { runStatus: "starting" }, "thinking"],
    ["running is working", { runStatus: "running" }, "working"],
    ["waiting is working", { runStatus: "waiting" }, "working"],
    ["just completed celebrates", { runStatus: "completed", justCompleted: true }, "done"],
    ["no thread welcomes", { hasThread: false }, "welcome"],
    ["settled thread is idle", { runStatus: "completed" }, "idle"],
  ] as const)("%s", (_name, overrides, expected) => {
    expect(deriveMascotState({ ...base, ...overrides })).toBe(expected);
  });

  it("only working, thinking, offline and idle loop", () => {
    const looping = Object.entries(MASCOT_MANIFEST)
      .filter(([, sprite]) => sprite.mode === "loop")
      .map(([state]) => state)
      .toSorted();
    expect(looping).toEqual(["idle", "offline", "thinking", "working"]);
  });
});

describe("mascot gestures", () => {
  it("every gesture plays once and never chains another gesture", () => {
    for (const sprite of Object.values(MASCOT_GESTURES)) {
      expect(sprite.mode).toBe("once");
      expect(sprite.gestures).toEqual([]);
    }
  });

  it.each([
    ["working picks the first gesture at random 0", "working", 0, "coffee"],
    ["working picks the last gesture at random ~1", "working", 0.999, "stretch"],
    ["thinking only twists the cube", "thinking", 0.5, "cube"],
    ["idle twists the cube", "idle", 0.5, "cube"],
    ["welcome twists the cube", "welcome", 0.5, "cube"],
    ["needsYou has no gesture", "needsYou", 0.5, null],
    ["error has no gesture", "error", 0.5, null],
    ["done has no gesture", "done", 0.5, null],
    ["offline has no gesture", "offline", 0.5, null],
  ] as const)("%s", (_name, state, random, expected) => {
    expect(pickMascotGesture(state, random)).toBe(expected);
  });

  it("delays the next gesture between 15 and 30 seconds", () => {
    expect(mascotGestureDelayMs(0)).toBe(15_000);
    expect(mascotGestureDelayMs(0.999)).toBeLessThan(30_000);
    expect(mascotGestureDelayMs(0.999)).toBeGreaterThan(29_000);
  });
});
