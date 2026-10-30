import { useAtomValue } from "@effect/atom-react";
import {
  isNextActionSuggestionCurrent,
  type NextActionRunObservation,
  shouldRequestNextAction,
} from "@t3tools/client-runtime/state/next-action-suggestion";
import type { EnvironmentId } from "@t3tools/contracts";
import { type RefObject, useEffect, useRef, useState } from "react";

import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import type { Thread } from "~/types";

interface Suggestion {
  readonly requestedFor: NextActionRunObservation;
  readonly text: string;
}

/** Ghost-text suggestion for the user's next message, requested when a watched turn completes. */
export function useNextActionSuggestion(input: {
  readonly enabled: boolean;
  readonly environmentId: EnvironmentId;
  readonly thread: Thread | undefined;
  readonly prompt: string;
  readonly promptRef: RefObject<string>;
}): { readonly suggestion: string | null; readonly dismiss: () => void } {
  const { enabled, environmentId, thread, prompt, promptRef } = input;
  const canSuggest = useAtomValue(
    threadEnvironment.suggestNextAction.permissionAtom(environmentId),
  );
  const suggestNextAction = useAtomCommand(threadEnvironment.suggestNextAction, {
    reportFailure: false,
  });
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const previousRef = useRef<NextActionRunObservation | null>(null);

  const threadId = thread?.id ?? null;
  const threadKey = threadId === null ? "" : `${environmentId}:${threadId}`;
  const runId = thread?.latestRun?.runId ?? null;
  const status = thread?.latestRun?.status ?? null;
  const current: NextActionRunObservation = { threadKey, runId, status };

  if (suggestion && !isNextActionSuggestionCurrent(suggestion.requestedFor, current, prompt)) {
    setSuggestion(null);
  }

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- requests a server suggestion when a watched run finishes; cleanup drops replies for a superseded run.
  useEffect(() => {
    const observation: NextActionRunObservation = { threadKey, runId, status };
    const previous = previousRef.current;
    previousRef.current = observation;
    if (
      !enabled ||
      !canSuggest ||
      threadId === null ||
      promptRef.current.length > 0 ||
      !shouldRequestNextAction(previous, observation)
    ) {
      return;
    }
    let superseded = false;
    void suggestNextAction({ environmentId, input: { threadId } }).then((result) => {
      if (superseded || result._tag !== "Success" || result.value.suggestion.length === 0) return;
      if (promptRef.current.length > 0) return;
      setSuggestion({ requestedFor: observation, text: result.value.suggestion });
    });
    return () => {
      superseded = true;
    };
  }, [
    enabled,
    canSuggest,
    environmentId,
    threadId,
    threadKey,
    runId,
    status,
    promptRef,
    suggestNextAction,
  ]);

  return {
    suggestion: enabled ? (suggestion?.text ?? null) : null,
    dismiss: () => setSuggestion(null),
  };
}
