import { RegistryContext } from "@effect/atom-react";
import type { AgentSessionProjectCandidate, EnvironmentId } from "@t3tools/contracts";
import { AuthOrchestrationOperateScope, CommandId } from "@t3tools/contracts";
import { ChevronRightIcon } from "lucide-react";
import { useContext, useState } from "react";

import { resolveOnboardingProjectId } from "../../onboarding/projectImport.logic";
import { useProjectScans } from "../../onboarding/useProjectScans";
import { newProjectId } from "../../lib/utils";
import { agentSessionImport, agentSessionListThreads } from "../../state/agentSessions";
import { readProjects } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";

const DEFAULT_WINDOW_DAYS = 30;
const PROVIDER_LABELS = { claudeAgent: "Claude Code", codex: "Codex" } as const;

function toDateInputValue(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight of a `YYYY-MM-DD` value, or null when the input is empty or invalid. */
function sinceIsoFromDateInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) || date.getTime() > Date.now() ? null : date.toISOString();
}

type ThreadCheckedChange = (
  filePaths: ReadonlyArray<string>,
  checked: boolean,
  listedFilePaths: ReadonlyArray<string>,
) => void;

function pluralThreads(count: number) {
  return `${count} ${count === 1 ? "conversation" : "conversations"}`;
}

export function HistoryImportSettings() {
  const { environment } = useSettingsScope();
  const environmentId = environment?.environmentId ?? null;
  if (environmentId === null) {
    return (
      <SettingsPageContainer>
        <p className="text-sm text-muted-foreground">
          Connect an environment to import Claude Code and Codex history.
        </p>
      </SettingsPageContainer>
    );
  }
  // Selection belongs to one environment, so a scope switch starts fresh.
  return <HistoryImportBody key={environmentId} environmentId={environmentId} />;
}

function HistoryImportBody({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const registry = useContext(RegistryContext);
  const [scan] = useProjectScans([environmentId]);
  const canImport = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const importThreads = useAtomCommand(agentSessionImport, { reportFailure: false });
  const [today] = useState(() => toDateInputValue(new Date()));
  const [sinceDate, setSinceDate] = useState(() =>
    toDateInputValue(new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)),
  );
  const [selectedPaths, setSelectedPaths] = useState<ReadonlySet<string>>(new Set());
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(new Set());
  const [excludedFiles, setExcludedFiles] = useState<ReadonlySet<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);

  const since = sinceIsoFromDateInput(sinceDate);
  const candidates = scan?.data?.candidates ?? [];
  const selected = candidates.filter((candidate) => selectedPaths.has(candidate.path));

  const toggle = (set: ReadonlySet<string>, keys: ReadonlyArray<string>, on: boolean) => {
    const next = new Set(set);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    return next;
  };

  const runImport = async () => {
    if (since === null || selected.length === 0 || isImporting) return;
    setIsImporting(true);
    let importedCount = 0;
    let skippedCount = 0;
    let failedProjects = 0;
    for (const candidate of selected) {
      let projectId = resolveOnboardingProjectId(readProjects(), environmentId, candidate);
      if (projectId === null) {
        projectId = newProjectId();
        const created = await createProject({
          environmentId,
          input: {
            projectId,
            commandId: CommandId.make(`history-import:project:create:${projectId}`),
            title: candidate.title,
            workspaceRoot: candidate.path,
            createWorkspaceRootIfMissing: false,
            defaultModelSelection: null,
          },
        });
        if (created._tag !== "Success") {
          failedProjects += 1;
          continue;
        }
      }
      const result = await importThreads({
        environmentId,
        input: {
          projectId,
          expectedWorkspaceRoot: candidate.path,
          since,
          excludeFilePaths: [...excludedFiles],
        },
      });
      if (result._tag === "Success") {
        importedCount += result.value.importedCount;
        skippedCount += result.value.skippedCount;
      } else {
        failedProjects += 1;
      }
    }
    setIsImporting(false);
    scan?.refresh();
    for (const path of expandedPaths) {
      registry.refresh(
        agentSessionListThreads({ environmentId, input: { workspaceRoot: path, since } }),
      );
    }
    const problems = [
      skippedCount > 0
        ? `${pluralThreads(skippedCount)} skipped. Run import again to continue.`
        : "",
      failedProjects > 0
        ? `${failedProjects} ${failedProjects === 1 ? "project" : "projects"} failed.`
        : "",
    ].filter(Boolean);
    toastManager.add({
      type: problems.length > 0 ? "warning" : "success",
      title: `Imported ${pluralThreads(importedCount)}`,
      ...(problems.length > 0 ? { description: problems.join(" ") } : {}),
    });
  };

  return (
    <SettingsPageContainer className="gap-8">
      <SettingsSection title="Import history">
        <SettingsRow
          title="Conversations since"
          description="Import Claude Code and Codex conversations last active on or after this date. Conversations already imported are kept."
          control={
            <Input
              type="date"
              aria-label="Conversations since"
              className="w-40"
              value={sinceDate}
              max={today}
              disabled={isImporting}
              onChange={(event) => setSinceDate(event.target.value)}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Projects"
        headerAction={
          <Button
            size="sm"
            disabled={!canImport || since === null || selected.length === 0 || isImporting}
            onClick={() => void runImport()}
          >
            {isImporting ? <Spinner size="sm" /> : null}
            Import {selected.length > 0 ? `${selected.length} selected` : ""}
          </Button>
        }
      >
        <div className="space-y-0.5 p-2">
          {!canImport ? (
            <p className="px-2 py-1 text-sm text-muted-foreground" role="alert">
              This connection cannot import projects or thread history.
            </p>
          ) : null}
          {scan === undefined || (scan.isPending && scan.data === null) ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Spinner size="md" />
              Looking for Claude Code and Codex projects…
            </div>
          ) : scan.error !== null ? (
            <div role="alert" className="flex items-center justify-between gap-3 px-2 text-sm">
              <span className="text-muted-foreground">Could not check projects. {scan.error}</span>
              <Button variant="ghost" size="sm" onClick={scan.refresh}>
                Retry
              </Button>
            </div>
          ) : candidates.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              No Claude Code or Codex projects found.
            </p>
          ) : (
            candidates.map((candidate) => (
              <HistoryProjectRow
                key={candidate.path}
                environmentId={environmentId}
                candidate={candidate}
                since={since}
                disabled={isImporting}
                checked={selectedPaths.has(candidate.path)}
                expanded={expandedPaths.has(candidate.path)}
                excludedFiles={excludedFiles}
                onCheckedChange={(checked) =>
                  setSelectedPaths((current) => toggle(current, [candidate.path], checked))
                }
                onExpandedChange={(expanded) =>
                  setExpandedPaths((current) => toggle(current, [candidate.path], expanded))
                }
                onThreadCheckedChange={(filePaths, checked, listedFilePaths) => {
                  if (checked && !selectedPaths.has(candidate.path)) {
                    // Checking one conversation of an unselected project selects only that one.
                    setExcludedFiles((current) =>
                      toggle(toggle(current, listedFilePaths, true), filePaths, false),
                    );
                    setSelectedPaths((current) => toggle(current, [candidate.path], true));
                    return;
                  }
                  setExcludedFiles((current) => toggle(current, filePaths, !checked));
                }}
              />
            ))
          )}
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function HistoryProjectRow({
  environmentId,
  candidate,
  since,
  disabled,
  checked,
  expanded,
  excludedFiles,
  onCheckedChange,
  onExpandedChange,
  onThreadCheckedChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly candidate: AgentSessionProjectCandidate;
  readonly since: string | null;
  readonly disabled: boolean;
  readonly checked: boolean;
  readonly expanded: boolean;
  readonly excludedFiles: ReadonlySet<string>;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onThreadCheckedChange: ThreadCheckedChange;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/40">
        <Checkbox
          aria-label={`Import ${candidate.title}`}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <button
          type="button"
          className="group flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-90" />
          <span className="min-w-0 truncate text-sm">{candidate.title}</span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{candidate.path}</span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
            {candidate.alreadyImported ? "In T3 · " : ""}
            {pluralThreads(candidate.threadCount)}
          </span>
        </button>
      </div>
      {expanded ? (
        since === null ? (
          <p className="py-1.5 pl-10 text-xs text-muted-foreground">Choose a valid date.</p>
        ) : (
          <HistoryThreadList
            environmentId={environmentId}
            workspaceRoot={candidate.path}
            since={since}
            disabled={disabled}
            projectChecked={checked}
            excludedFiles={excludedFiles}
            onThreadCheckedChange={onThreadCheckedChange}
          />
        )
      ) : null}
    </div>
  );
}

function HistoryThreadList({
  environmentId,
  workspaceRoot,
  since,
  disabled,
  projectChecked,
  excludedFiles,
  onThreadCheckedChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly since: string;
  readonly disabled: boolean;
  readonly projectChecked: boolean;
  readonly excludedFiles: ReadonlySet<string>;
  readonly onThreadCheckedChange: ThreadCheckedChange;
}) {
  const listing = useEnvironmentQuery(
    agentSessionListThreads({ environmentId, input: { workspaceRoot, since } }),
  );
  if (listing.data === null) {
    return listing.error !== null ? (
      <p role="alert" className="py-1.5 pl-10 text-xs text-muted-foreground">
        Could not list conversations. {listing.error}
      </p>
    ) : (
      <div className="flex items-center gap-2 py-1.5 pl-10 text-xs text-muted-foreground">
        <Spinner size="sm" />
        Reading conversations…
      </div>
    );
  }
  const { threads, alreadyImportedCount, skippedCount } = listing.data;
  const listedFilePaths = threads.flatMap((thread) => thread.filePaths);
  return (
    <div className="space-y-0.5 pb-1 pl-8">
      {threads.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          No new conversations since this date.
        </p>
      ) : (
        threads.map((thread) => (
          <label
            key={thread.filePaths[0]}
            className="flex items-center gap-2.5 rounded-md px-2 py-1 hover:bg-muted/40"
          >
            <Checkbox
              checked={projectChecked && !excludedFiles.has(thread.filePaths[0])}
              disabled={disabled}
              onCheckedChange={(next) =>
                onThreadCheckedChange(thread.filePaths, next === true, listedFilePaths)
              }
            />
            <span className="min-w-0 flex-1 truncate text-sm">{thread.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {PROVIDER_LABELS[thread.provider]} · {new Date(thread.updatedAt).toLocaleDateString()}
            </span>
          </label>
        ))
      )}
      {alreadyImportedCount > 0 || skippedCount > 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground" role="status">
          {alreadyImportedCount > 0
            ? `${pluralThreads(alreadyImportedCount)} already imported. `
            : ""}
          {skippedCount > 0
            ? `${pluralThreads(skippedCount)} not listed: unreadable or beyond this batch.`
            : ""}
        </p>
      ) : null}
    </div>
  );
}
