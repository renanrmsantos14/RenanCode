import type { ThreadContextRecord } from "@t3tools/contracts";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { formatThreadLink } from "@t3tools/shared/threadLinks";
import { collectInlineContextIds } from "./lib/composerContextReferences";

export function projectPendingUserInputAnswer(
  answer: unknown,
  threadContexts: ReadonlyArray<ThreadContextRecord>,
) {
  if (typeof answer !== "string" || threadContexts.length === 0) return answer;
  const recordsById = new Map(threadContexts.map((record) => [record.contextId, record]));
  return replaceComposerContextReferences(answer, (reference) => {
    const record = reference.kind === "thread" ? recordsById.get(reference.contextId) : undefined;
    return record ? formatThreadLink(record, reference.label) : reference.source;
  });
}

// Question drafts retain deleted chip records for undo; only transfer referenced records.
export function threadContextsReferencedByAnswer(
  answer: string,
  threadContexts: ReadonlyArray<ThreadContextRecord>,
) {
  const referencedIds = new Set(collectInlineContextIds(answer));
  return threadContexts.filter((record) => referencedIds.has(record.contextId));
}

const DISPLACED_ANSWER_SEPARATOR = "\n\n";

export function carryDisplacedCustomAnswerIntoPrompt(
  prompt: string,
  customAnswer: string | undefined,
): string {
  const displaced = customAnswer?.trim() ?? "";
  if (displaced.length === 0) {
    return prompt;
  }
  if (prompt.trim().length === 0) {
    return displaced;
  }
  return `${prompt.trimEnd()}${DISPLACED_ANSWER_SEPARATOR}${displaced}`;
}
