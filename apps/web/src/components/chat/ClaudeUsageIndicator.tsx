import type { EnvironmentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { normalizeProviderAccentColor } from "@t3tools/client-runtime/state/provider-instance-display";
import {
  type ClaudeAccountUsage,
  claudeAccountText,
  claudeWeeklyReading,
  selectClaudeUsageAccounts,
} from "@t3tools/shared/usageLimits";
import { useGT } from "gt-react";
import { GaugeIcon } from "lucide-react";
import { useRef, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { cn } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Popover, PopoverCreateHandle, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { toastManager } from "../ui/toast";
import { useResetCredit, ResetCreditDialog } from "../usage/UsageLimits";
import { PROVIDER_PRESENTATION } from "../usage/usageProviders";
import { ClaudeUsageDetail, type ResetCreditTarget, UsageBar } from "./ClaudeUsageDetail";
import betinhosIcon from "./accountIcons/betinhos.png";
import renancodeIcon from "./accountIcons/renancode.png";
import { composerFloatingLayerProps } from "./composerEventScope";

let nextTriggerId = 0;

/** One per chat pane: a popover handle drives a single mounted root, and the side chat mounts its own. */
export function createClaudeUsageDetail() {
  const handle = PopoverCreateHandle();
  const triggerId = `claude-usage-indicator-${nextTriggerId++}`;
  return {
    handle,
    triggerId,
    /** False when no indicator is mounted (no Claude account on this thread). */
    open: () => {
      handle.open(triggerId);
      return handle.isOpen;
    },
  };
}

export type ClaudeUsageDetailControl = ReturnType<typeof createClaudeUsageDetail>;

function accountSummary(account: ClaudeAccountUsage, now: number): string {
  return claudeAccountText(account, (checkedAt) => formatRelativeTimeLabel(checkedAt, now));
}

/** "Claude Betinhos" → "B": the badge tells accounts apart; the full name stays in the title. */
function accountInitial(label: string): string {
  const name = label.replace(/^claude\s+/i, "").trim() || label;
  return (name[0] ?? "C").toUpperCase();
}

/** This fork's two Claude accounts, matched by display name; any other account keeps its initial. */
const ACCOUNT_ICONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/betinhos/i, betinhosIcon],
  [/renan/i, renancodeIcon],
];

function accountIcon(label: string): string | undefined {
  return ACCOUNT_ICONS.find(([pattern]) => pattern.test(label))?.[1];
}

function AccountMeter({ account }: { readonly account: ClaudeAccountUsage }) {
  const reading = claudeWeeklyReading(account);
  const color =
    normalizeProviderAccentColor(account.accentColor) ?? PROVIDER_PRESENTATION.claude.color;
  const icon = accountIcon(account.label);
  return (
    <span className={cn("flex shrink-0 items-center gap-1", account.stale && "opacity-60")}>
      {icon ? (
        <img src={icon} alt="" aria-hidden="true" className="size-4 shrink-0 rounded-full" />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-4 shrink-0 items-center justify-center rounded-full text-4xs font-semibold leading-none text-white"
          style={{ backgroundColor: color }}
        >
          {accountInitial(account.label)}
        </span>
      )}
      <span className="flex w-8 flex-col gap-0.75">
        <span
          className={cn(
            "text-2xs leading-none",
            reading?.over ? "text-warning-foreground" : "text-foreground",
          )}
        >
          {reading ? `${reading.used}%` : "n/a"}
        </span>
        <UsageBar
          used={reading?.used ?? 0}
          goal={reading?.goal ?? null}
          over={reading?.over ?? false}
          color={color}
          label=""
          className="h-0.75"
        />
      </span>
    </span>
  );
}

/** Confirmation lives outside the popover: popovers stack above dialogs and unmount on close. */
function ResetCreditHost({
  target,
  onDone,
}: {
  readonly target: ResetCreditTarget;
  readonly onDone: () => void;
}) {
  const redeem = useResetCredit(target.environmentId);
  const [asking, setAsking] = useState(true);
  return (
    <ResetCreditDialog
      open={asking}
      onOpenChange={(open) => {
        if (open) return;
        setAsking(false);
        onDone();
      }}
      choice={target.choice}
      onConfirm={async () => {
        setAsking(false);
        const text = await redeem.redeem(target.choice);
        if (text) toastManager.add({ type: "info", title: text });
        onDone();
      }}
      disabled={!redeem.canManageProviders || redeem.busy}
    />
  );
}

/**
 * Weekly use for each Claude account: a colored initial, the percent used and a bar with today's goal tick.
 * Reads the provider snapshot itself so a new snapshot re-renders this control, not the composer.
 */
export function ClaudeUsageIndicator({
  environmentId,
  compact,
  detail,
}: {
  readonly environmentId: EnvironmentId;
  readonly compact: boolean;
  readonly detail: ClaudeUsageDetailControl;
}) {
  const gt = useGT();
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const [redeemTarget, setRedeemTarget] = useState<ResetCreditTarget | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const accounts = selectClaudeUsageAccounts({
    providers: config?.providers ?? [],
    sources: config?.usageLimitSources,
    now,
  });
  if (accounts.length === 0) return null;
  const anyOver = accounts.some((account) => claudeWeeklyReading(account)?.over);
  const summary = accounts.map((account) => accountSummary(account, now)).join(" · ");
  return (
    <>
      <PopoverTrigger
        handle={detail.handle}
        id={detail.triggerId}
        render={
          <Button
            size="xs"
            variant="ghost-muted"
            className="min-w-0 max-w-64 shrink overflow-hidden"
            aria-label={gt("Claude usage: {summary}", { summary })}
            title={summary}
          />
        }
      >
        {compact ? (
          <GaugeIcon aria-hidden="true" className={cn(anyOver && "text-warning-foreground")} />
        ) : (
          <span aria-hidden="true" className="flex min-w-0 items-center gap-2.5 tabular-nums">
            {accounts.map((account) => (
              <AccountMeter key={account.instanceId} account={account} />
            ))}
          </span>
        )}
      </PopoverTrigger>
      <Popover handle={detail.handle}>
        <PopoverPopup
          ref={popupRef}
          initialFocus={popupRef}
          {...composerFloatingLayerProps}
          side="top"
          align="end"
          width="lg"
          className="text-left whitespace-normal"
        >
          <ClaudeUsageDetail
            environmentId={environmentId}
            accounts={accounts}
            now={now}
            onRedeem={(target) => {
              detail.handle.close();
              setRedeemTarget(target);
            }}
          />
        </PopoverPopup>
      </Popover>
      {redeemTarget ? (
        <ResetCreditHost
          key={JSON.stringify(redeemTarget.choice.input)}
          target={redeemTarget}
          onDone={() => setRedeemTarget(null)}
        />
      ) : null}
    </>
  );
}
