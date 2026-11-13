import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { formatInlineContextReference } from "./lib/composerContextReferences";
import { reviewCommentContextRecord, threadContextReference } from "./lib/composerContextRecords";
import { threadContextRecord } from "@t3tools/shared/composerContextReferences";

import {
  carryDisplacedCustomAnswerIntoPrompt,
  projectPendingUserInputAnswer,
  threadContextsReferencedByAnswer,
  withdrawDisplacedCustomAnswerFromPrompt,
} from "./pendingUserInput";

describe("projectPendingUserInputAnswer", () => {
  const record = threadContextRecord(
    {
      environmentId: EnvironmentId.make("env-answer"),
      threadId: ThreadId.make("reference-thread"),
    },
    "Reference work",
  );

  it("sends thread chips as readable links with the actual thread ID", () => {
    const answer = `Compare ${formatInlineContextReference(threadContextReference(record))}`;
    expect(projectPendingUserInputAnswer(answer, [record])).toBe(
      "Compare [Reference work](t3-thread://v2/env-answer/reference-thread)",
    );
  });

  // regression: #28022 a review comment chip in an answer reached the agent as a bare link
  it("sends review comment chips with the comment text and diff", () => {
    const comment = reviewCommentContextRecord({
      id: "file-comment-1",
      sectionId: "branch",
      sectionTitle: "Changes",
      filePath: "notes.md",
      startIndex: 2,
      endIndex: 2,
      rangeLabel: "+2",
      text: "Rename this to line two updated",
      diff: "@@ -0,0 +2,1 @@\n+line two changed",
      fenceLanguage: "diff",
    });
    const answer = `See my note: ${formatInlineContextReference({
      kind: "review-comment",
      contextId: comment.contextId,
      label: comment.label,
    })}`;
    const projected = projectPendingUserInputAnswer(answer, [comment]);
    expect(projected).toContain("Rename this to line two updated");
    expect(projected).toContain("+line two changed");
  });

  // regression: #18789 answers to pending questions lost exact text and option values
  it("preserves option values and exact answer text", () => {
    const options = [" first\t", "second"];
    expect(projectPendingUserInputAnswer(options, [record])).toBe(options);
    expect(projectPendingUserInputAnswer("  Edited answer\n", [record])).toBe("  Edited answer\n");
  });
});

describe("threadContextsReferencedByAnswer", () => {
  const kept = threadContextRecord(
    { environmentId: EnvironmentId.make("env-answer"), threadId: ThreadId.make("kept-thread") },
    "Kept work",
  );
  const deleted = threadContextRecord(
    { environmentId: EnvironmentId.make("env-answer"), threadId: ThreadId.make("deleted-thread") },
    "Deleted work",
  );

  it("preserves remaining chips without restoring deleted thread records", () => {
    const answer = `Compare ${formatInlineContextReference(threadContextReference(kept))}`;
    expect(threadContextsReferencedByAnswer(answer, [deleted, kept])).toEqual([kept]);
  });
});

describe("carryDisplacedCustomAnswerIntoPrompt", () => {
  // regression: #12577 clicking a question option discarded typed text
  it("keeps the thread draft when nothing was typed into the answer", () => {
    expect(carryDisplacedCustomAnswerIntoPrompt("draft", undefined)).toBe("draft");
    expect(carryDisplacedCustomAnswerIntoPrompt("draft", "   ")).toBe("draft");
  });

  // regression: #12577 clicking a question option discarded typed text
  it("moves the typed answer into an empty thread draft", () => {
    expect(carryDisplacedCustomAnswerIntoPrompt("", "also rename the flag ")).toBe(
      "also rename the flag",
    );
  });

  it("appends the typed answer after an existing thread draft", () => {
    expect(carryDisplacedCustomAnswerIntoPrompt("first half\n", "second half")).toBe(
      "first half\n\nsecond half",
    );
  });
});

describe("withdrawDisplacedCustomAnswerFromPrompt", () => {
  // regression: #35205 an answer restored with undo stayed in the thread draft and was sent twice
  it("takes set-aside text back out of the thread draft and leaves the rest", () => {
    const setAside = carryDisplacedCustomAnswerIntoPrompt("", "first answer ");
    expect(withdrawDisplacedCustomAnswerFromPrompt(setAside, "first answer ")).toBe("");

    const afterDraft = carryDisplacedCustomAnswerIntoPrompt("draft", "first answer");
    expect(withdrawDisplacedCustomAnswerFromPrompt(afterDraft, "first answer")).toBe("draft");

    const beforeSecond = carryDisplacedCustomAnswerIntoPrompt(setAside, "second answer");
    expect(
      withdrawDisplacedCustomAnswerFromPrompt(beforeSecond, "first answer", ["second answer"]),
    ).toBe("second answer");

    const between = carryDisplacedCustomAnswerIntoPrompt(afterDraft, "second answer");
    expect(
      withdrawDisplacedCustomAnswerFromPrompt(between, "first answer", ["second answer"]),
    ).toBe("draft\n\nsecond answer");
  });

  it("removes its own copy, not equal text inside a later set-aside answer", () => {
    const first = carryDisplacedCustomAnswerIntoPrompt("", "foo");
    const both = carryDisplacedCustomAnswerIntoPrompt(first, "bar\n\nfoo");
    expect(withdrawDisplacedCustomAnswerFromPrompt(both, "foo", ["bar\n\nfoo"])).toBe("bar\n\nfoo");
  });

  it("leaves a thread draft that no longer holds the set-aside text where it was put", () => {
    expect(withdrawDisplacedCustomAnswerFromPrompt("first answer, edited", "first answer")).toBe(
      "first answer, edited",
    );
    expect(withdrawDisplacedCustomAnswerFromPrompt("my first answer", "first answer")).toBe(
      "my first answer",
    );
    expect(withdrawDisplacedCustomAnswerFromPrompt("draft", "  ")).toBe("draft");
  });
});
