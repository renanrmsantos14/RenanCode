import type { EnvironmentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import {
  type ClaudeAccountUsage,
  claudeAccountText,
  claudeWeeklyReading,
  selectClaudeUsageAccounts,
} from "@t3tools/shared/usageLimits";
import { GaugeIcon } from "lucide-react";
import { Fragment, useRef, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { cn } from "../../lib/utils";
import { serverEnvironment } from "../../state/server";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Popover, PopoverCreateHandle, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { toastManager } from "../ui/toast";
import { useResetCredit, ResetCreditDialog } from "../usage/UsageLimits";
import { ClaudeUsageDetail, type ResetCreditTarget } from "./ClaudeUsageDetail";
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

/** Confirmation lives outside the popover: popovers stack above dialogs and unmount on close. */
function ResetCreditHost({
  target,
  onDone,
}: {
  readonly target: ResetCreditTarget;
  readonly onDone: () => void;
}) {
  const redeem = useResetCredit(target.environmentId, target.input);
  const [asking, setAsking] = useState(true);
  return (
    <ResetCreditDialog
      open={asking}
      onOpenChange={(open) => {
        if (open) return;
        setAsking(false);
        onDone();
      }}
      onConfirm={async () => {
        setAsking(false);
        const text = await redeem.redeem();
        if (text) toastManager.add({ type: "info", title: text });
        onDone();
      }}
      disabled={!redeem.canManageProviders || redeem.busy}
    />
  );
}

/**
 * Weekly use against today's goal for each Claude account, e.g. `Claude 36/60 · Renan 72/80`.
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
            className="min-w-0 shrink"
            aria-label={`Claude usage: ${summary}`}
            title={compact ? summary : undefined}
          />
        }
      >
        {compact ? (
          <GaugeIcon aria-hidden="true" className={cn(anyOver && "text-warning-foreground")} />
        ) : (
          <span className="flex min-w-0 items-center gap-1.5 truncate tabular-nums">
            {accounts.map((account, index) => {
              const reading = claudeWeeklyReading(account);
              return (
                <Fragment key={account.instanceId}>
                  {index > 0 ? <span aria-hidden="true">·</span> : null}
                  <span
                    className={cn(
                      "truncate",
                      reading?.over && "text-warning-foreground",
                      account.stale && "opacity-60",
                    )}
                  >
                    {accountSummary(account, now)}
                  </span>
                </Fragment>
              );
            })}
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
          key={JSON.stringify(redeemTarget.input)}
          target={redeemTarget}
          onDone={() => setRedeemTarget(null)}
        />
      ) : null}
    </>
  );
}
