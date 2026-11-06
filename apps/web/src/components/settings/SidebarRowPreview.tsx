import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { ThreadPullRequestLink, ThreadPullRequestSnapshot } from "@t3tools/contracts";

import { useClientSettings } from "../../hooks/useSettings";
import { useEnvironmentMachines } from "../../state/environments";
import { useVisibleThreadShells } from "../../state/entities";
import { sidebarProviderEntriesAtom } from "../sidebar/sidebarProviderEntries";
import { SidebarThreadRow, type SidebarProviderEntry } from "../sidebar/SidebarThreadRow";

const NOOP = () => {};
const EMPTY_PROVIDER_ENTRIES: ReadonlyMap<string, SidebarProviderEntry> = new Map();

interface PreviewCase {
  readonly label: string;
  readonly agent: "idle" | "waiting" | "working";
  readonly pullRequest: Partial<ThreadPullRequestSnapshot>;
}

const MERGED = { state: "merged", mergedAt: "2026-01-01T00:00:00.000Z" } as const;

const PREVIEW_CASES: ReadonlyArray<PreviewCase> = [
  { label: "Agent working", agent: "working", pullRequest: { checksState: "passing" } },
  { label: "Waiting on checks", agent: "waiting", pullRequest: { checksState: "pending" } },
  { label: "Checks failed", agent: "idle", pullRequest: { checksState: "failing" } },
  { label: "Conflict", agent: "idle", pullRequest: { mergeability: "conflicting" } },
  { label: "Ready to merge", agent: "idle", pullRequest: { checksState: "passing" } },
  {
    label: "Deploying",
    agent: "idle",
    pullRequest: { ...MERGED, mergeCommitChecksState: "pending" },
  },
  {
    label: "Deploy failed",
    agent: "idle",
    pullRequest: { ...MERGED, mergeCommitChecksState: "failing" },
  },
  {
    label: "Delivered",
    agent: "idle",
    pullRequest: { ...MERGED, mergeCommitChecksState: "passing" },
  },
];

function previewLink(
  number: number,
  thread: EnvironmentThreadShell,
  pullRequest: PreviewCase["pullRequest"],
) {
  return {
    host: "github.com",
    repository: "preview/repository",
    number,
    url: "https://github.com",
    source: "created",
    linkedAt: thread.updatedAt,
    snapshot: {
      state: "open",
      title: thread.title,
      headBranch: thread.branch ?? "feature",
      baseBranch: "main",
      isDraft: false,
      updatedAt: thread.updatedAt,
      syncedAt: thread.updatedAt,
      mergeability: "mergeable",
      ...pullRequest,
    },
    stack: null,
  } satisfies ThreadPullRequestLink;
}

/** One of the user's own threads, put in a case's agent and pull request state. */
function previewThread(thread: EnvironmentThreadShell, index: number, preview: PreviewCase) {
  return {
    ...thread,
    id: `${thread.id}:preview:${index}` as EnvironmentThreadShell["id"],
    branch: thread.branch ?? "feature/preview",
    pinnedAt: null,
    snoozedUntil: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    pendingGuestMessageCount: 0,
    blockedOnThreadWait: false,
    linkedPullRequest: null,
    branchPullRequest: null,
    pullRequests: [previewLink(100 + index, thread, preview.pullRequest)],
    runtime:
      preview.agent === "idle"
        ? null
        : {
            status: preview.agent === "working" ? "running" : "idle",
            activeRunId: null,
            providerInstanceId: thread.modelSelection.instanceId,
            providerName: null,
            lastError: null,
            updatedAt: thread.updatedAt,
          },
  } satisfies EnvironmentThreadShell;
}

/**
 * Folder rows as the sidebar draws them, from the user's most recent threads in each pull request
 * state. The rows read the same settings, so the preview follows every change at once.
 */
export function SidebarRowPreview() {
  const shells = useVisibleThreadShells();
  const multiline = useClientSettings((settings) => settings.boringSidebarMultilineRows);
  const timestampFormat = useClientSettings((settings) => settings.timestampFormat);
  const providerEntriesByEnvironment = useAtomValue(sidebarProviderEntriesAtom);
  const machineById = useEnvironmentMachines();
  const recent = shells
    .filter((thread) => thread.archivedAt === null)
    .toSorted((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, PREVIEW_CASES.length);
  if (recent.length === 0) {
    return (
      <p className="px-4 py-3 text-muted-foreground text-xs">
        Start a thread to preview folder rows with it.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1 p-2" aria-label="Folder row preview">
      {PREVIEW_CASES.map((preview, index) => {
        const source = recent[index % recent.length]!;
        const thread = previewThread(source, index, preview);
        return (
          <li key={preview.label} className="flex list-none items-center gap-3">
            <span className="w-28 shrink-0 text-right text-muted-foreground text-xs">
              {preview.label}
            </span>
            <ul className="w-72 min-w-0 rounded-md bg-sidebar py-0.5">
              <SidebarThreadRow
                thread={thread}
                variant={multiline ? "folder-multiline" : "folder"}
                variantAction="settle"
                settlementSupported={false}
                snoozeSupported={false}
                pinningSupported={false}
                isPinned={false}
                dropVerb={null}
                dragOverPinned={false}
                sweepAction={null}
                snoozeWakeLabelText={null}
                wokeAt={null}
                isActive={false}
                isRouteThread={false}
                openPullRequestsInRightPanel={false}
                jumpLabel={null}
                currentEnvironmentId={source.environmentId}
                environmentLabel={null}
                environmentMachine={machineById.get(source.environmentId) ?? "server"}
                scratchMachineLabel={null}
                project={null}
                projectDisplayName={null}
                providerEntryByInstanceId={
                  providerEntriesByEnvironment.get(source.environmentId) ?? EMPTY_PROVIDER_ENTRIES
                }
                timestampFormat={timestampFormat}
                onThreadClick={NOOP}
                onThreadActivate={NOOP}
                onStartRename={NOOP}
                onRenameTitleChange={NOOP}
                onCommitRename={NOOP}
                onCancelRename={NOOP}
                isRenaming={false}
                renamingTitle=""
                onContextMenu={NOOP}
                onSettle={NOOP}
                onTesting={NOOP}
                onActionSweepStart={NOOP}
                onUnsettle={NOOP}
                onUnsnooze={NOOP}
                onSnooze={NOOP}
                onUnpin={NOOP}
                onAcknowledgeWoke={NOOP}
                subsessionCount={0}
                subsessionsCollapsed
                subsessionDot={null}
                onToggleSubsessions={NOOP}
              />
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
