import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  type ClaudeAccountUsage,
  claudeAccountText,
  claudeWeeklyReading,
  formatAgo,
  selectClaudeUsageAccounts,
} from "@t3tools/shared/usageLimits";
import { Pressable, useWindowDimensions, View } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { useNowMinuteMs } from "../../lib/clock";
import { serverEnvironment } from "../../state/server";

const EMPTY: readonly never[] = [];
// Two accounts with names and ages overflow below this width, so they collapse to numbers.
const NARROW_WIDTH = 400;

function accountText(account: ClaudeAccountUsage, now: number, withName: boolean): string {
  return claudeAccountText(account, (checkedAt) => formatAgo(checkedAt, now), withName);
}

/**
 * Weekly use against today's goal for each Claude account, e.g. `Claude 36/60 · Renan 72/80`.
 * Reads the provider snapshot itself so a new snapshot re-renders this row, not the composer.
 * Sits on its own row above the composer surface, so it can never crowd the send button.
 */
export function ClaudeUsageIndicator(props: {
  readonly environmentId: EnvironmentId;
  readonly onPress: () => void;
}) {
  const providers = useAtomValue(serverEnvironment.providersValueAtom(props.environmentId));
  const now = useNowMinuteMs();
  const { width } = useWindowDimensions();
  const accounts = selectClaudeUsageAccounts({ providers: providers ?? EMPTY, now });
  if (accounts.length === 0) return null;
  const collapsed = accounts.length > 1 && width < NARROW_WIDTH;
  const summary = accounts.map((account) => accountText(account, now, true)).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Claude usage: ${summary}`}
      accessibilityHint="Opens usage limits"
      hitSlop={{ top: 8, bottom: 8 }}
      onPress={props.onPress}
      className="mb-1 min-w-0 flex-row items-center gap-1.5 self-start px-3 py-1 active:opacity-60"
    >
      <SymbolView
        name="chart.bar.xaxis"
        size={12}
        tintColorClassName="accent-icon-muted"
        type="monochrome"
      />
      <View className="min-w-0 shrink flex-row items-center gap-1.5">
        {collapsed ? <Text className="text-xs text-foreground-muted">Claude</Text> : null}
        {accounts.map((account, index) => (
          <View key={account.instanceId} className="min-w-0 shrink flex-row items-center gap-1.5">
            {index > 0 ? <Text className="text-xs text-foreground-muted">·</Text> : null}
            <Text
              numberOfLines={1}
              className={
                claudeWeeklyReading(account)?.over
                  ? `shrink text-xs tabular-nums text-warning-foreground ${account.stale ? "opacity-60" : ""}`
                  : `shrink text-xs tabular-nums text-foreground-muted ${account.stale ? "opacity-60" : ""}`
              }
            >
              {accountText(account, now, !collapsed)}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
