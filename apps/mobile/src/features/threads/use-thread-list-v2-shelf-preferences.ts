import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useCallback, useMemo } from "react";
import { AsyncResult } from "effect/reactivity";

import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";

const EMPTY_COLLAPSED_SUBSESSIONS: ReadonlySet<string> = new Set();

export function useThreadListV2ShelfPreferences() {
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferencesResult);
  const snoozedShelfExpanded =
    loaded && preferencesResult.value.threadListSnoozedShelfExpanded === true;
  const settledShelfExpanded =
    loaded && preferencesResult.value.threadListSettledShelfExpanded === true;
  const workingShelfEnabled = loaded && preferencesResult.value.workingShelfEnabled !== false;
  const workingShelfExpanded =
    loaded && preferencesResult.value.threadListWorkingShelfExpanded === true;

  const collapsedList = loaded ? preferencesResult.value.threadListCollapsedSubsessions : undefined;
  const collapsedSubsessions = useMemo(
    () => (collapsedList ? new Set(collapsedList) : EMPTY_COLLAPSED_SUBSESSIONS),
    [collapsedList],
  );

  // Transforms read optimistic state so same-frame presses toggle twice.
  const toggleSnoozedShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListSnoozedShelfExpanded: current.threadListSnoozedShelfExpanded !== true,
      }),
    });
  };
  const toggleSettledShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListSettledShelfExpanded: current.threadListSettledShelfExpanded !== true,
      }),
    });
  };
  const toggleWorkingShelf = () => {
    if (!loaded) return;
    savePreferences({
      transform: (current) => ({
        threadListWorkingShelfExpanded: current.threadListWorkingShelfExpanded !== true,
      }),
    });
  };

  // Rows are memoized on this callback, so it stays stable.
  const toggleSubsessions = useCallback(
    (threadKey: string) => {
      if (!loaded) return;
      savePreferences({
        transform: (current) => {
          const collapsed = new Set(current.threadListCollapsedSubsessions);
          if (!collapsed.delete(threadKey)) collapsed.add(threadKey);
          return { threadListCollapsedSubsessions: [...collapsed] };
        },
      });
    },
    [loaded, savePreferences],
  );

  return {
    loaded,
    collapsedSubsessions,
    toggleSubsessions,
    settledShelfExpanded,
    snoozedShelfExpanded,
    workingShelfEnabled,
    workingShelfExpanded,
    toggleSettledShelf,
    toggleSnoozedShelf,
    toggleWorkingShelf,
  } as const;
}
