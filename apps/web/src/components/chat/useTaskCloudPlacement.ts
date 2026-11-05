import type { ClaudeCloudPlacementResult, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import { type DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { useStableCallback } from "../../hooks/useStableCallback";
import { claudeCloudEnvironment } from "../../state/claudeCloud";
import { useAtomCommand } from "../../state/use-atom-command";

// Classify after typing pauses, so a task costs one model call rather than one per keystroke.
const TYPING_PAUSE_MS = 1_200;
const MIN_TASK_CHARS = 12;

interface TaskCloudPlacementInput {
  readonly active: boolean;
  readonly environmentId: EnvironmentId | null;
  readonly projectId: ProjectId | null;
  readonly draftId: DraftId | null;
}

/** Asks the draft's machine whether the typed task can run in a Claude cloud session. */
export function useTaskCloudPlacement(input: TaskCloudPlacementInput) {
  const { active, environmentId, projectId, draftId } = input;
  const suggest = useAtomCommand(claudeCloudEnvironment.suggestPlacement, {
    reportFailure: false,
  });
  const scope = `${environmentId ?? ""}:${projectId ?? ""}:${draftId ?? ""}`;
  const [placement, setPlacement] = useState<{
    readonly scope: string;
    readonly text: string;
    readonly result: ClaudeCloudPlacementResult;
  } | null>(null);
  const inFlightRef = useRef<{
    readonly key: string;
    readonly promise: Promise<ClaudeCloudPlacementResult | null>;
  } | null>(null);

  /** Resolves to null when routing is off or the machine could not answer. */
  const classify = useStableCallback((rawText: string) => {
    const text = rawText.trim();
    if (!active || environmentId === null || projectId === null || text.length === 0) {
      return Promise.resolve(null);
    }
    if (placement?.scope === scope && placement.text === text) {
      return Promise.resolve(placement.result);
    }
    const key = `${scope}\n${text}`;
    if (inFlightRef.current?.key === key) return inFlightRef.current.promise;
    const promise = suggest({ environmentId, input: { projectId, text } }).then((result) => {
      if (inFlightRef.current?.key === key) inFlightRef.current = null;
      if (result._tag === "Failure") return null;
      setPlacement({ scope, text, result: result.value });
      return result.value;
    });
    inFlightRef.current = { key, promise };
    return promise;
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- watches the draft text in the store so typing never re-renders the chat view
  useEffect(() => {
    if (!active || draftId === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (prompt: string | undefined) => {
      clearTimeout(timer);
      const text = prompt?.trim() ?? "";
      if (text.length < MIN_TASK_CHARS) return;
      timer = setTimeout(() => void classify(text), TYPING_PAUSE_MS);
    };
    schedule(useComposerDraftStore.getState().draftsByThreadKey[draftId]?.prompt);
    const unsubscribe = useComposerDraftStore.subscribe((state, previous) => {
      const prompt = state.draftsByThreadKey[draftId]?.prompt;
      if (prompt !== previous.draftsByThreadKey[draftId]?.prompt) schedule(prompt);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [active, draftId, classify]);

  return {
    /** The latest answer for this draft, possibly for slightly older text. */
    placement: active && placement?.scope === scope ? placement.result : null,
    classify,
  };
}
