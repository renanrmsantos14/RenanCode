import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  isNextActionSuggestionCurrent,
  type NextActionRunObservation,
  shouldRequestNextAction,
} from "@t3tools/client-runtime/state/next-action-suggestion";
import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useRef, useState } from "react";

import { mobilePreferencesAtom } from "../../state/preferences";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { getComposerDraftSnapshot } from "../../state/use-composer-drafts";

interface Suggestion {
  readonly requestedFor: NextActionRunObservation;
  readonly text: string;
}

/** Suggested next message, requested when a turn this composer watched completes. */
export function useNextActionSuggestion(input: {
  readonly environmentId: EnvironmentId;
  readonly thread: EnvironmentThreadShell;
  readonly draftKey: string;
  readonly draftText: string;
}): { readonly suggestion: string | null; readonly dismiss: () => void } {
  const { environmentId, thread, draftKey, draftText } = input;
  const preferences = useAtomValue(mobilePreferencesAtom);
  const enabled =
    AsyncResult.isSuccess(preferences) && preferences.value.nextActionSuggestionsEnabled === true;
  const canSuggest = useAtomValue(
    threadEnvironment.suggestNextAction.permissionAtom(environmentId),
  );
  const suggestNextAction = useAtomCommand(threadEnvironment.suggestNextAction, {
    reportFailure: false,
  });
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const previousRef = useRef<NextActionRunObservation | null>(null);

  const threadId = thread.id;
  const threadKey = `${environmentId}:${threadId}`;
  const runId = thread.latestRun?.runId ?? null;
  const status = thread.latestRun?.status ?? null;
  const current: NextActionRunObservation = { threadKey, runId, status };

  if (suggestion && !isNextActionSuggestionCurrent(suggestion.requestedFor, current, draftText)) {
    setSuggestion(null);
  }

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- requests a server suggestion when a watched run finishes; cleanup drops replies for a superseded run.
  useEffect(() => {
    const observation: NextActionRunObservation = { threadKey, runId, status };
    const previous = previousRef.current;
    previousRef.current = observation;
    const draftIsEmpty = () => getComposerDraftSnapshot(draftKey).text.length === 0;
    if (
      !enabled ||
      !canSuggest ||
      !draftIsEmpty() ||
      !shouldRequestNextAction(previous, observation)
    ) {
      return;
    }
    let superseded = false;
    void suggestNextAction({ environmentId, input: { threadId } }).then((result) => {
      if (superseded || result._tag !== "Success" || result.value.suggestion.length === 0) return;
      if (!draftIsEmpty()) return;
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
    draftKey,
    suggestNextAction,
  ]);

  return {
    suggestion: enabled ? (suggestion?.text ?? null) : null,
    dismiss: () => setSuggestion(null),
  };
}
