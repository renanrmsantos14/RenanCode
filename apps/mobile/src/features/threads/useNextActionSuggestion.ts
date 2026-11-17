import { useAtomValue } from "@effect/atom-react";
import {
  dismissNextAction,
  isNextActionDismissed,
  nextActionDismissalKey,
  resolveNextActionDisplay,
  subscribeNextActionDismissals,
  type NextActionDisplay,
} from "@t3tools/client-runtime/state/next-action-suggestion";
import { deriveLatestThreadRun } from "@t3tools/client-runtime/state/thread-execution";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { nextActionSuggestionsMigrationPatch } from "@t3tools/shared/serverSettings";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useSyncExternalStore } from "react";

import { environmentCatalog } from "../../connection/catalog";
import { mobilePreferencesAtom } from "../../state/preferences";
import { useEnvironmentQuery } from "../../state/query";
import { environmentServerConfigsAtom, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useQuietThreadStructure } from "../../state/use-thread-detail";

const attemptedMigrationGenerations = new Map<EnvironmentId, number>();

/**
 * Suggested next message the server stored on the thread's latest run. Only the thread detail
 * carries it; the shell's latest run does not.
 */
export function useNextActionSuggestion(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly promptEmpty: boolean;
}): { readonly display: NextActionDisplay | null; readonly dismiss: () => void } {
  const { environmentId, threadId, promptEmpty } = input;
  const preferences = useAtomValue(mobilePreferencesAtom);
  const configs = useAtomValue(environmentServerConfigsAtom);
  const settings = configs.get(environmentId)?.settings;
  const connection = useEnvironmentQuery(environmentCatalog.stateAtom(environmentId)).data;
  const connectionGeneration = connection?.phase === "connected" ? connection.generation : null;
  const saveSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "next action suggestions migration",
    reportFailure: false,
  });
  const legacyEnabled = AsyncResult.isSuccess(preferences)
    ? preferences.value.nextActionSuggestionsEnabled
    : undefined;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the one-time legacy toggle migration to server settings once per connection
  useEffect(() => {
    if (
      !settings ||
      connectionGeneration === null ||
      attemptedMigrationGenerations.get(environmentId) === connectionGeneration
    )
      return;
    const patch = nextActionSuggestionsMigrationPatch(settings, {
      nextActionSuggestionsEnabled: legacyEnabled,
    });
    if (!patch) return;
    attemptedMigrationGenerations.set(environmentId, connectionGeneration);
    void saveSettings({ environmentId, input: { patch } });
  }, [connectionGeneration, environmentId, legacyEnabled, saveSettings, settings]);

  const structure = useQuietThreadStructure(threadId === null ? null : { environmentId, threadId });
  const run = structure === null ? null : deriveLatestThreadRun(structure.projection);
  const key = run ? nextActionDismissalKey(`${environmentId}:${threadId}`, run.runId) : null;
  const dismissed = useSyncExternalStore(subscribeNextActionDismissals, () =>
    key === null ? false : isNextActionDismissed(key),
  );
  const dismiss = () => {
    if (key !== null) dismissNextAction(key);
  };

  return { display: resolveNextActionDisplay({ run, dismissed, promptEmpty }), dismiss };
}
