import { describe, expect, it } from "vite-plus/test";

import { deriveMascotState, MASCOT_MANIFEST, type MascotInput } from "./mascot.ts";

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

  it("only working and offline loop", () => {
    const looping = Object.entries(MASCOT_MANIFEST)
      .filter(([, sprite]) => sprite.mode === "loop")
      .map(([state]) => state)
      .toSorted();
    expect(looping).toEqual(["offline", "working"]);
  });
});
