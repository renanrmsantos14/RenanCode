import { describe, expect, it } from "vite-plus/test";

import { buildNextActionPrompt } from "./textGenerationPrompts.ts";
import { normalizeCliError } from "./textGenerationUtils.ts";

describe("normalizeCliError", () => {
  it("does not expose CLI failure details in the public error message", () => {
    const result = normalizeCliError(
      "codex",
      "generateCommitMessage",
      new Error("request failed with access_token=secret-token"),
      "Failed to generate a commit message",
    );

    expect(result.detail).toBe("Failed to generate a commit message");
    expect(result.message).not.toContain("secret-token");
  });
});

describe("buildNextActionPrompt", () => {
  it("keeps the end of a long agent reply, where the follow-up question usually is", () => {
    const { prompt } = buildNextActionPrompt({
      lastUserMessage: "Fix the flaky test",
      lastAssistantMessage: `START${"x".repeat(5_000)}Should I open a PR?`,
    });
    expect(prompt).toContain("Should I open a PR?");
    expect(prompt).not.toContain("START");
    expect(prompt).toContain("[Earlier content truncated]");
  });
});
