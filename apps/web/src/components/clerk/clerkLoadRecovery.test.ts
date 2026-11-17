import { describe, expect, it } from "vite-plus/test";

import { nextClerkLoadRecoveryStep } from "./clerkLoadRecovery";

describe("nextClerkLoadRecoveryStep", () => {
  it.each([
    [0, "reload"],
    [1, "clear-session-and-reload"],
    [2, "give-up"],
    [5, "give-up"],
  ] as const)("after %i failed reloads returns %s", (failedReloads, step) => {
    expect(nextClerkLoadRecoveryStep(failedReloads)).toBe(step);
  });
});
