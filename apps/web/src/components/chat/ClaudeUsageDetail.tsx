import {
  AuthProvidersManageScope,
  type EnvironmentId,
  type ProviderConsumeResetCreditInput,
  type ServerProviderResetCredits,
  type ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { normalizeProviderAccentColor } from "@t3tools/client-runtime/state/provider-instance-display";
import {
  type ClaudeAccountUsage,
  limitInstanceName,
  CLAUDE_USAGE_ERROR_TEXT,
  claudeGoalSummary,
  forecastText,
  weeklyBarLabel,
  windowUsedText,
  claudeWeeklyReading,
  collectLimitAccounts,
  collectLimitNotices,
  formatDuration,
  type LimitAccount,
  limitAccountsBesideClaude,
  limitsNotice,
  exhaustionForecast,
  USAGE_GOAL_TIME_ZONE,
} from "@t3tools/shared/usageLimits";
import type { ReactNode } from "react";

import { ensureLocalApi } from "../../localApi";
import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { environmentPresentations } from "../../state/presentation";
import { useEnvironmentScope } from "../../state/session";
import { formatRelativeTimeLabel, formatUpcomingTimestamp } from "../../timestampFormat";
import { providerClients } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { LimitWindows, resetCreditsSummary } from "../usage/UsageLimits";
import { PROVIDER_PRESENTATION } from "../usage/usageProviders";

export interface ResetCreditTarget {
  readonly environmentId: EnvironmentId;
  readonly input: ProviderConsumeResetCreditInput;
}

function AccountName({ label }: { readonly label: string }) {
  return label.includes("@") ? (
    <RedactedSensitiveText
      key={label}
      value={label}
      ariaLabel="Toggle account label visibility"
      revealTooltip="Click to reveal account"
      hideTooltip="Click to hide account"
      className="max-w-full truncate align-bottom font-sans text-xs leading-normal"
    />
  ) : (
    label
  );
}

/** Fills from 0% as usage; the tick marks today's goal. */
function UsageBar({
  used,
  goal,
  over,
  color,
  label,
}: {
  readonly used: number;
  readonly goal: number | null;
  readonly over: boolean;
  readonly color: string;
  readonly label: string;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className="relative block h-1.5 rounded-full bg-muted-foreground/20"
    >
      {used > 0 ? (
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", over && "bg-warning")}
          style={{ width: `max(${used}%, 6px)`, ...(over ? {} : { backgroundColor: color }) }}
        />
      ) : null}
      {goal !== null ? (
        <span
          aria-hidden
          className="absolute -top-[3px] h-[calc(100%+6px)] w-px -translate-x-1/2 bg-foreground/60"
          style={{ left: `${goal}%` }}
        />
      ) : null}
    </span>
  );
}

function CreditsRow({
  credits,
  now,
  canManage,
  onUse,
}: {
  readonly credits: ServerProviderResetCredits;
  readonly now: number;
  readonly canManage: boolean;
  readonly onUse: () => void;
}) {
  if (credits.availableCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span className="tabular-nums">{resetCreditsSummary(credits, now)}</span>
      <Button size="xs" variant="outline" disabled={!canManage} onClick={onUse}>
        Use reset
      </Button>
    </div>
  );
}

function ClaudeAccountBlock({
  account,
  now,
  canManage,
  onRedeem,
}: {
  readonly account: ClaudeAccountUsage;
  readonly now: number;
  readonly canManage: boolean;
  readonly onRedeem: (target: ResetCreditTarget["input"]) => void;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const color =
    normalizeProviderAccentColor(account.accentColor) ?? PROVIDER_PRESENTATION.claude.color;
  const reading = claudeWeeklyReading(account);
  const { weekly, session } = account;
  const forecast = weekly ? exhaustionForecast(weekly, now) : undefined;
  const resetsAt = weekly?.resetsAt ? Date.parse(weekly.resetsAt) : Number.NaN;
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="truncate text-xs font-medium text-foreground">
        <AccountName label={account.label} />
      </h3>
      {weekly && reading ? (
        <div className="flex flex-col gap-1">
          <UsageBar
            used={reading.used}
            goal={reading.goal}
            over={reading.over}
            color={color}
            label={weeklyBarLabel(reading)}
          />
          <span className="text-xs text-foreground tabular-nums">
            {claudeGoalSummary(weekly, now, account.goal) ?? `Used ${reading.used}%`}
          </span>
          {Number.isFinite(resetsAt) && weekly.resetsAt ? (
            <span className="text-xs text-muted-foreground">
              Resets{" "}
              {formatUpcomingTimestamp(weekly.resetsAt, timestampFormat, now, USAGE_GOAL_TIME_ZONE)}{" "}
              (São Paulo)
              {resetsAt > now ? ` · in ${formatDuration(resetsAt - now)}` : ""}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {forecastText(forecast, (at) =>
              formatUpcomingTimestamp(
                new Date(at).toISOString(),
                timestampFormat,
                now,
                USAGE_GOAL_TIME_ZONE,
              ),
            )}
          </span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">No weekly reading yet</span>
      )}
      <WindowLine window={session} label="5-hour window" emptyText="No active window" now={now} />
      {account.scoped.map((window) => (
        <WindowLine key={window.id} window={window} label={window.label} now={now} />
      ))}
      <span
        className={cn("text-xs text-muted-foreground", account.stale && "text-warning-foreground")}
      >
        Updated {formatRelativeTimeLabel(account.limits.checkedAt, now) || "n/a"}
      </span>
      {account.limits.lastError ? (
        <span className="text-xs text-warning-foreground">
          {CLAUDE_USAGE_ERROR_TEXT[account.limits.lastError.reason]}
        </span>
      ) : null}
      {account.limits.resetCredits ? (
        <CreditsRow
          credits={account.limits.resetCredits}
          now={now}
          canManage={canManage}
          onUse={() => onRedeem(account.resetCreditInput)}
        />
      ) : null}
    </section>
  );
}

function WindowLine({
  window,
  label,
  emptyText,
  now,
}: {
  readonly window: ServerProviderUsageWindow | undefined;
  readonly label: string;
  readonly emptyText?: string;
  readonly now: number;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3 text-xs">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 text-foreground tabular-nums">
        {window ? windowUsedText(window, now) : (emptyText ?? "")}
      </span>
    </span>
  );
}

function otherAccountLabel(account: LimitAccount): string {
  const driver = providerClients.get(account.driver)?.label ?? String(account.driver);
  const who = limitInstanceName(account, driver);
  return who ? `${driver} · ${who}` : driver;
}

function OtherAccountBlock({
  account,
  now,
  canManage,
  onRedeem,
}: {
  readonly account: LimitAccount;
  readonly now: number;
  readonly canManage: boolean;
  readonly onRedeem: (target: ResetCreditTarget) => void;
}) {
  const notice = limitsNotice(account.limits);
  const externalUsage = account.limits.externalUsage;
  const { redeem } = account;
  return (
    <section className="flex min-w-0 flex-col gap-1">
      <h3 className="truncate text-xs font-medium text-foreground">
        <AccountName label={otherAccountLabel(account)} />
        {account.plan ? ` · ${account.plan}` : null}
      </h3>
      {notice ? (
        <span className="text-xs text-muted-foreground">{notice}</span>
      ) : (
        <LimitWindows
          compact
          driver={account.driver}
          accentColor={account.accentColor}
          windows={account.limits.windows}
          now={now}
        />
      )}
      {externalUsage ? (
        <Button
          size="sm"
          variant="link"
          className="self-start"
          onClick={() => void ensureLocalApi().shell.openExternal(externalUsage.url)}
        >
          Manage usage
        </Button>
      ) : null}
      {redeem && account.limits.resetCredits ? (
        <CreditsRow
          credits={account.limits.resetCredits}
          now={now}
          canManage={canManage}
          onUse={() => onRedeem(redeem)}
        />
      ) : null}
    </section>
  );
}

/** Claude accounts first, then the limits of every other provider on the same environment. */
export function ClaudeUsageDetail({
  environmentId,
  accounts,
  now,
  onRedeem,
}: {
  readonly environmentId: EnvironmentId;
  readonly accounts: readonly ClaudeAccountUsage[];
  readonly now: number;
  readonly onRedeem: (target: ResetCreditTarget) => void;
}) {
  const canManage = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const presentation = useAtomValue(environmentPresentations.presentationsWithProvidersAtom).get(
    environmentId,
  );
  const presentations = presentation ? new Map([[environmentId, presentation]]) : new Map();
  const others = limitAccountsBesideClaude(collectLimitAccounts(presentations));
  const notices = collectLimitNotices(presentations);
  const sections: ReactNode[] = [];
  for (const account of accounts) {
    sections.push(
      <ClaudeAccountBlock
        key={account.instanceId}
        account={account}
        now={now}
        canManage={canManage}
        onRedeem={(input) => onRedeem({ environmentId, input })}
      />,
    );
  }
  for (const account of others) {
    sections.push(
      <OtherAccountBlock
        key={account.key}
        account={account}
        now={now}
        canManage={canManage}
        onRedeem={onRedeem}
      />,
    );
  }
  return (
    <div className="flex max-h-[min(32rem,var(--available-height))] w-full flex-col gap-4 overflow-y-auto py-3">
      {sections}
      {notices.map((notice) => (
        <span key={notice} className="text-xs text-muted-foreground">
          {notice}
        </span>
      ))}
    </div>
  );
}
