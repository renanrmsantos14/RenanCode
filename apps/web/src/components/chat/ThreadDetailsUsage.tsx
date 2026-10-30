import type {
  ProviderInstanceId,
  ServerProvider,
  ServerProviderUsageWindow,
  UsageLimitSourceSnapshots,
} from "@t3tools/contracts";
import {
  collectProviderUsageLimits,
  formatDuration,
  type LimitPace,
  limitsNotice,
  paceOf,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import type { ReactNode } from "react";

import { usePrimarySettings } from "../../hooks/useSettings";
import { useNowMinute } from "../../hooks/useNowMinute";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ThreadDetailsSection } from "./ThreadDetailsSection";

const PACE_LABEL: Record<LimitPace, string> = {
  ahead: "Ahead of pace",
  on: "On pace",
  under: "Under pace",
};

export interface ThreadDetailsUsageInput {
  readonly providerInstanceId: ProviderInstanceId | null;
  readonly providers: readonly ServerProvider[];
  readonly sources: UsageLimitSourceSnapshots;
  readonly contextWindow: ContextWindowSnapshot | null;
}

/**
 * The selected provider's limit windows and the thread's context window.
 * Every row reads as usage, so the bar fills up from 0% as the window is spent.
 */
export function ThreadDetailsUsage({
  providerInstanceId,
  providers,
  sources,
  contextWindow,
}: ThreadDetailsUsageInput) {
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const report =
    providerInstanceId !== null
      ? collectProviderUsageLimits(providerInstanceId, providers, sources, now)
      : null;
  // Only this instance's data: the report keeps one instance per login, and any other entry may be
  // a different login or workspace, so fall back to the instance's own snapshot.
  const limits =
    report?.accounts.find((entry) => entry.instanceId === providerInstanceId)?.limits ??
    providers.find((provider) => provider.instanceId === providerInstanceId)?.usageLimits;
  const notice = limits ? limitsNotice(limits) : null;
  if (!limits && !contextWindow) return null;

  return (
    <ThreadDetailsSection
      headingId="thread-details-usage-heading"
      title="Usage"
      showHeading={false}
    >
      <div className="grid grid-cols-[auto_minmax(3rem,1fr)_auto] gap-x-3 text-xs">
        {notice ? (
          <UsageRow
            label="Limits"
            used={null}
            value="Unavailable"
            tooltip={<span className="text-foreground">{notice}</span>}
          />
        ) : null}
        {limits && !notice
          ? limits.windows.map((window) => <LimitRow key={window.id} window={window} now={now} />)
          : null}
        {contextWindow ? <ContextRow usage={contextWindow} spaced={limits !== undefined} /> : null}
      </div>
    </ThreadDetailsSection>
  );
}

function LimitRow({
  window,
  now,
}: {
  readonly window: ServerProviderUsageWindow;
  readonly now: number;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const used = 100 - remainingPercent(window);
  const pace = paceOf(window, now);
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : Number.NaN;
  return (
    <UsageRow
      label={window.label}
      used={used}
      tooltip={
        <>
          <span className="text-foreground">
            {window.label}: {used}% used
          </span>
          {window.resetsAt && resetsAt > now ? (
            <span className="text-muted-foreground">
              Resets in {formatDuration(resetsAt - now)} ·{" "}
              {formatUpcomingTimestamp(window.resetsAt, timestampFormat, now)}
            </span>
          ) : null}
          {pace ? <span className="text-muted-foreground">{PACE_LABEL[pace]}</span> : null}
        </>
      }
    />
  );
}

function ContextRow({
  usage,
  spaced,
}: {
  readonly usage: ContextWindowSnapshot;
  readonly spaced: boolean;
}) {
  const maxTokens = usage.maxTokens ?? null;
  const usedPercent =
    maxTokens !== null && usage.usedPercentage !== null
      ? Math.round(Math.max(0, Math.min(100, usage.usedPercentage)))
      : null;
  const usedTokens = formatContextWindowTokens(usage.usedTokens);
  return (
    <UsageRow
      label="Context"
      used={usedPercent}
      muted
      className={cn(spaced && "mt-2")}
      tooltip={
        <>
          {usedPercent !== null ? (
            <span className="text-foreground">Context: {usedPercent}% used</span>
          ) : null}
          <span className={usedPercent !== null ? "text-muted-foreground" : "text-foreground"}>
            {maxTokens !== null
              ? `${usedTokens} of ${formatContextWindowTokens(maxTokens)} tokens used`
              : `${usedTokens} tokens used`}
          </span>
        </>
      }
      value={usedPercent === null ? usedTokens : undefined}
    />
  );
}

/** One label, hairline, and value row; the whole row opens the details tooltip. */
function UsageRow({
  label,
  used,
  tooltip,
  value,
  muted = false,
  className,
}: {
  readonly label: string;
  readonly used: number | null;
  readonly tooltip: ReactNode;
  /** Replaces the percentage when there is none. */
  readonly value?: string | undefined;
  readonly muted?: boolean;
  readonly className?: string | undefined;
}) {
  const tone = used === null ? null : used >= 90 ? "error" : used >= 80 ? "warning" : null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            tabIndex={0}
            aria-label={`${label}: ${value ?? `${used}% used`}`}
            className={cn(
              "col-span-3 grid h-6 cursor-default grid-cols-subgrid items-center rounded-lg px-2.5 outline-none hover:bg-black/[0.035] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-popup-open:bg-black/[0.035] dark:hover:bg-white/[0.08] dark:data-popup-open:bg-white/[0.08]",
              className,
            )}
          />
        }
      >
        <span className="max-w-28 truncate text-muted-foreground">{label}</span>
        {used !== null ? (
          <span className="relative h-[3px] rounded-full bg-muted-foreground/30 dark:bg-muted-foreground/20">
            {used > 0 ? (
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  tone === "error"
                    ? "bg-error"
                    : tone === "warning"
                      ? "bg-warning"
                      : muted
                        ? "bg-muted-foreground"
                        : "bg-foreground/80",
                )}
                style={{ width: `max(${used}%, 6px)` }}
              />
            ) : null}
          </span>
        ) : null}
        <span
          className={cn(
            // Text-only rows span the bar column so they never widen the shared value column.
            "text-end font-medium tabular-nums",
            used === null && "col-span-2",
            tone === "error"
              ? "text-error-foreground"
              : tone === "warning"
                ? "text-warning-foreground"
                : used === null
                  ? "text-muted-foreground"
                  : "text-foreground/80",
          )}
        >
          {value ?? `${used}%`}
        </span>
      </TooltipTrigger>
      {/* Rows sit 8px inside the card; clear its edge instead of overlapping it. */}
      <TooltipPopup side="left" sideOffset={16}>
        <div className="flex flex-col gap-0.5">{tooltip}</div>
      </TooltipPopup>
    </Tooltip>
  );
}
