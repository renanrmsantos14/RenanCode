import { useAtomValue } from "@effect/atom-react";
import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { resolveListedAncestorThreadRef } from "@t3tools/client-runtime/state/threads";
import { isClaudeCloudThreadId } from "@t3tools/contracts";

import { scopedThreadKey } from "../../lib/scopedEntities";
import { environmentThreadShells, listedCloudSessionEnvironmentAtom } from "../../state/threads";

/**
 * An open subagent, side chat or delegated task has no row; its listed ancestor's row is selected.
 * A cloud session has one row for every environment's copy, so that row is selected.
 */
export function useSidebarRowThreadKey(openThreadKey: string | null): string | null {
  const threads = useAtomValue(environmentThreadShells.quietThreadShellsAtom);
  const openThreadRef = openThreadKey === null ? null : parseScopedThreadKey(openThreadKey);
  const rowRef =
    openThreadRef === null ? null : resolveListedAncestorThreadRef(openThreadRef, threads);
  const listedEnvironmentId = useAtomValue(
    listedCloudSessionEnvironmentAtom(
      rowRef !== null && isClaudeCloudThreadId(rowRef.threadId) ? rowRef.threadId : null,
    ),
  );
  if (rowRef === null) return openThreadKey;
  return scopedThreadKey(listedEnvironmentId ?? rowRef.environmentId, rowRef.threadId);
}
