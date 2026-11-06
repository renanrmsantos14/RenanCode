import type { ClaudeCloudPlacementResult, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";

import { type DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { useStableCallback } from "../../hooks/useStableCallback";
import { claudeCloudEnvironment } from "../../state/claudeCloud";
import { useAtomCommand } from "../../state/use-atom-command";

// Users send seconds after typing, so classification starts on the briefest pause.
const TYPING_PAUSE_MS = 100;
const MIN_TASK_CHARS = 12;
// Matches the server's limit; past it the task runs on a machine as usual.
const PLACEMENT_TIMEOUT_MS = 15_000;

interface TaskCloudPlacementInput {
  readonly active: boolean;
  readonly environmentId: EnvironmentId | null;
  readonly projectId: ProjectId | null;
  readonly draftId: DraftId | null;
}

type PlacementRequest = Promise<ClaudeCloudPlacementResult | null>;

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
  const requestsRef = useRef(new Map<string, PlacementRequest>());
  // One background call at a time keeps typing from spawning a provider process per pause.
  const typingRef = useRef<{ inFlight: boolean; next: string | null }>({
    inFlight: false,
    next: null,
  });

  const request = useStableCallback((rawText: string): PlacementRequest => {
    const text = rawText.trim();
    if (!active || environmentId === null || projectId === null || text.length === 0) {
      return Promise.resolve(null);
    }
    if (placement?.scope === scope && placement.text === text) {
      return Promise.resolve(placement.result);
    }
    const key = `${scope}\n${text}`;
    const existing = requestsRef.current.get(key);
    if (existing) return existing;
    const call = suggest({ environmentId, input: { projectId, text } }).then((result) => {
      if (result._tag === "Failure") return null;
      setPlacement({ scope, text, result: result.value });
      return result.value;
    });
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), PLACEMENT_TIMEOUT_MS);
    });
    const pending = Promise.race([call, timeout]).finally(() => {
      requestsRef.current.delete(key);
    });
    requestsRef.current.set(key, pending);
    return pending;
  });

  const classifyWhileTyping = useStableCallback((text: string) => {
    const typing = typingRef.current;
    typing.next = text;
    if (typing.inFlight) return;
    typing.inFlight = true;
    void (async () => {
      while (typing.next !== null) {
        const current = typing.next;
        typing.next = null;
        await request(current);
      }
      typing.inFlight = false;
    })();
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- watches the draft text in the store so typing never re-renders the chat view
  useEffect(() => {
    if (!active || draftId === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (prompt: string | undefined) => {
      clearTimeout(timer);
      const text = prompt?.trim() ?? "";
      if (text.length < MIN_TASK_CHARS) return;
      timer = setTimeout(() => classifyWhileTyping(text), TYPING_PAUSE_MS);
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
  }, [active, draftId, classifyWhileTyping]);

  return {
    /** The latest answer for this draft, possibly for slightly older text. */
    placement: active && placement?.scope === scope ? placement.result : null,
    /** For sending: answers for exactly this text, null when routing is off, failed or timed out. */
    classify: request,
  };
}
