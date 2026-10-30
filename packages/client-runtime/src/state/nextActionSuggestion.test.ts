import { describe, expect, it } from "vite-plus/test";

import {
  isNextActionSuggestionCurrent,
  type NextActionRunObservation,
  shouldRequestNextAction,
} from "./nextActionSuggestion.ts";

const seen = (
  threadKey: string,
  runId: string | null,
  status: NextActionRunObservation["status"],
): NextActionRunObservation => ({ threadKey, runId, status });

describe("shouldRequestNextAction", () => {
  it.each([
    ["the watched run completes", seen("a", "r1", "running"), seen("a", "r1", "completed"), true],
    [
      "a new run arrives completed",
      seen("a", "r1", "completed"),
      seen("a", "r2", "completed"),
      true,
    ],
    ["nothing changed", seen("a", "r1", "completed"), seen("a", "r1", "completed"), false],
    ["the user switched threads", seen("a", "r1", "running"), seen("b", "r9", "completed"), false],
    ["the composer just mounted", null, seen("a", "r1", "completed"), false],
    ["the run was interrupted", seen("a", "r1", "running"), seen("a", "r1", "interrupted"), false],
    ["the run failed", seen("a", "r1", "running"), seen("a", "r1", "failed"), false],
  ] as const)("%s -> %s", (_name, previous, current, expected) => {
    expect(shouldRequestNextAction(previous, current)).toBe(expected);
  });
});

describe("isNextActionSuggestionCurrent", () => {
  const requested = seen("a", "r1", "completed");
  it.each([
    ["unchanged and empty", seen("a", "r1", "completed"), "", true],
    ["the user typed", seen("a", "r1", "completed"), "h", false],
    ["a new turn started", seen("a", "r2", "running"), "", false],
    ["another thread is open", seen("b", "r1", "completed"), "", false],
  ] as const)("%s", (_name, current, prompt, expected) => {
    expect(isNextActionSuggestionCurrent(requested, current, prompt)).toBe(expected);
  });
});
