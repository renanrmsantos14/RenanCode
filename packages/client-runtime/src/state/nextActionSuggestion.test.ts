import { describe, expect, it } from "vite-plus/test";

import {
  dismissNextAction,
  isNextActionDismissed,
  nextActionDismissalKey,
  resolveNextActionDisplay,
} from "./nextActionSuggestion.ts";

const ready = {
  status: "completed",
  nextActionSuggestion: { status: "ready", text: "Run it" },
} as const;

describe("resolveNextActionDisplay", () => {
  it.each([
    [
      "ready",
      { run: ready, dismissed: false, promptEmpty: true },
      { status: "ready", text: "Run it" },
    ],
    [
      "pending",
      {
        run: { status: "completed", nextActionSuggestion: { status: "pending" } },
        dismissed: false,
        promptEmpty: true,
      },
      { status: "pending" },
    ],
    ["hidden while typing", { run: ready, dismissed: false, promptEmpty: false }, null],
    [
      "back when the draft is cleared",
      { run: ready, dismissed: false, promptEmpty: true },
      { status: "ready", text: "Run it" },
    ],
    ["dismissed", { run: ready, dismissed: true, promptEmpty: true }, null],
    [
      "none",
      {
        run: { status: "completed", nextActionSuggestion: { status: "none" } },
        dismissed: false,
        promptEmpty: true,
      },
      null,
    ],
    [
      "a newer run is running",
      { run: { status: "running" }, dismissed: false, promptEmpty: true },
      null,
    ],
    ["no run", { run: null, dismissed: false, promptEmpty: true }, null],
  ] as const)("%s", (_name, input, expected) => {
    expect(resolveNextActionDisplay(input)).toEqual(expected);
  });
});

describe("dismissNextAction", () => {
  it("is keyed by thread and run", () => {
    const key = nextActionDismissalKey("env:thread-a", "run-1");
    dismissNextAction(key);
    expect(isNextActionDismissed(key)).toBe(true);
    expect(isNextActionDismissed(nextActionDismissalKey("env:thread-a", "run-2"))).toBe(false);
    expect(isNextActionDismissed(nextActionDismissalKey("env:thread-b", "run-1"))).toBe(false);
  });
});
