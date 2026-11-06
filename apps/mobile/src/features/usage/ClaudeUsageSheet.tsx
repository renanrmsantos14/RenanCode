import { useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { normalizeProviderAccentColor } from "@t3tools/client-runtime/state/provider-instance-display";
import { PROVIDER_DISPLAY_NAMES, type EnvironmentId } from "@t3tools/contracts";
import {
  CLAUDE_USAGE_ERROR_TEXT,
  type ClaudeAccountUsage,
  limitInstanceName,
  claudeGoalSummary,
  forecastText,
  weeklyBarLabel,
  windowUsedText,
  claudeWeeklyReading,
  collectLimitAccounts,
  collectLimitNotices,
  exhaustionForecast,
  limitAccountsBesideClaude,
  formatAgo,
  formatDuration,
  formatGoalZoneInstant,
  selectClaudeUsageAccounts,
} from "@t3tools/shared/usageLimits";
import { Platform, ScrollView, View } from "react-native";
import { ScreenStack } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBar } from "../../components/ui/AppBar";
import { AppText as Text } from "../../components/ui/AppText";
import { ScreenContent } from "../../components/ui/ScreenContent";
import { useNowMinuteMs } from "../../lib/clock";
import { NativeStackScreenOptions, nativeHeaderScrollEdgeEffects } from "../../native/StackHeader";
import { NativeHeader, NativeScreen } from "../../native/ThemedScreenStack";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import { MaskedAccountLabel } from "./MaskedAccountLabel";
import { AccountLimits, ResetCredits } from "./UsageLimitsSection";
import { useProviderColors } from "./usageProviders";

const HEADER_SCROLL_EDGE_EFFECTS = nativeHeaderScrollEdgeEffects(Platform.OS, Platform.Version);
const EMPTY: readonly never[] = [];

function AccountName({ label }: { readonly label: string }) {
  return <MaskedAccountLabel value={label} className="text-base font-t3-medium text-foreground" />;
}

/** Fills from 0% as usage; the tick marks today's goal. */
function UsageBar(props: {
  readonly used: number;
  readonly goal: number | null;
  readonly over: boolean;
  readonly color: string;
  readonly label: string;
}) {
  const { used, goal, over } = props;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={props.label}
      accessibilityValue={{ min: 0, max: 100, now: used }}
      className="h-3 justify-center"
    >
      <View className="h-1.5 overflow-hidden rounded-full bg-subtle">
        {used > 0 ? (
          <View
            className={over ? "h-full rounded-full bg-warning" : "h-full rounded-full"}
            style={{
              width: `${Math.min(100, Math.max(used, 2))}%`,
              ...(over ? {} : { backgroundColor: props.color }),
            }}
          />
        ) : null}
      </View>
      {goal !== null ? (
        <View
          className="absolute top-px bottom-px w-0.5 rounded-full bg-foreground"
          style={{ left: `${Math.min(100, goal)}%`, marginLeft: -1 }}
        />
      ) : null}
    </View>
  );
}

function WindowLine(props: {
  readonly window: ClaudeAccountUsage["weekly"];
  readonly label: string;
  readonly emptyText?: string;
  readonly now: number;
}) {
  const { window, now } = props;
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="min-w-0 shrink text-sm text-foreground-muted" numberOfLines={1}>
        {props.label}
      </Text>
      <Text className="shrink-0 text-sm tabular-nums text-foreground">
        {window ? windowUsedText(window, now) : (props.emptyText ?? "")}
      </Text>
    </View>
  );
}

function ClaudeAccountBlock(props: {
  readonly environmentId: EnvironmentId;
  readonly account: ClaudeAccountUsage;
  readonly color: string;
  readonly now: number;
}) {
  const { account, now } = props;
  const reading = claudeWeeklyReading(account);
  const { weekly, session } = account;
  const forecast = weekly ? exhaustionForecast(weekly, now) : undefined;
  const resetsAt = weekly?.resetsAt ? Date.parse(weekly.resetsAt) : Number.NaN;
  return (
    <View className="gap-2">
      <AccountName label={account.label} />
      {weekly && reading ? (
        <View className="gap-1">
          <UsageBar
            used={reading.used}
            goal={reading.goal}
            over={reading.over}
            color={props.color}
            label={weeklyBarLabel(reading)}
          />
          <Text className="text-sm tabular-nums text-foreground">
            {claudeGoalSummary(weekly, now, account.goal) ?? `Used ${reading.used}%`}
          </Text>
          {Number.isFinite(resetsAt) ? (
            <Text className="text-xs text-foreground-muted">
              Resets {formatGoalZoneInstant(resetsAt, now)} (São Paulo)
              {resetsAt > now ? ` · in ${formatDuration(resetsAt - now)}` : ""}
            </Text>
          ) : null}
          <Text className="text-xs text-foreground-muted">
            {forecastText(forecast, (at) => formatGoalZoneInstant(at, now))}
          </Text>
        </View>
      ) : (
        <Text className="text-xs text-foreground-muted">No weekly reading yet</Text>
      )}
      <WindowLine window={session} label="5-hour window" emptyText="No active window" now={now} />
      {account.scoped.map((window) => (
        <WindowLine key={window.id} window={window} label={window.label} now={now} />
      ))}
      <Text
        className={
          account.stale ? "text-xs text-warning-foreground" : "text-xs text-foreground-muted"
        }
      >
        Updated {formatAgo(account.limits.checkedAt, now) || "n/a"}
      </Text>
      {account.limits.lastError ? (
        <Text className="text-xs text-warning-foreground" numberOfLines={1}>
          {CLAUDE_USAGE_ERROR_TEXT[account.limits.lastError.reason]}
        </Text>
      ) : null}
      {account.limits.resetCredits ? (
        <ResetCredits
          dense
          environmentId={props.environmentId}
          input={account.resetCreditInput}
          credits={account.limits.resetCredits}
          now={now}
        />
      ) : null}
    </View>
  );
}

export function ClaudeUsageContent(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const providers = useAtomValue(serverEnvironment.providersValueAtom(environmentId));
  const presentation = useAtomValue(environmentPresentations.presentationsWithProvidersAtom).get(
    environmentId,
  );
  const now = useNowMinuteMs();
  const colors = useProviderColors();
  const accounts = selectClaudeUsageAccounts({
    providers: providers ?? EMPTY,
    sources: presentation?.serverConfig?.usageLimitSources,
    now,
  });
  const presentations = presentation ? new Map([[environmentId, presentation]]) : new Map();
  const others = limitAccountsBesideClaude(collectLimitAccounts(presentations));
  const notices = collectLimitNotices(presentations);
  return (
    <View className="gap-6">
      {accounts.map((account) => (
        <ClaudeAccountBlock
          key={account.instanceId}
          environmentId={environmentId}
          account={account}
          now={now}
          color={normalizeProviderAccentColor(account.accentColor) ?? colors.claude}
        />
      ))}
      {others.map((account, index) => {
        const driver = PROVIDER_DISPLAY_NAMES[account.driver] ?? String(account.driver);
        const who = limitInstanceName(account, driver);
        return (
          <View key={account.key} className="-mx-4">
            <AccountLimits
              dense
              first={index === 0}
              driver={account.driver}
              accentColor={account.accentColor}
              label={driver}
              instanceLabel={who ?? driver}
              detail={account.plan}
              limits={account.limits}
              now={now}
              footer={
                account.redeem && account.limits.resetCredits ? (
                  <ResetCredits
                    dense
                    environmentId={account.redeem.environmentId}
                    input={account.redeem.input}
                    credits={account.limits.resetCredits}
                    now={now}
                  />
                ) : undefined
              }
            />
          </View>
        );
      })}
      {notices.map((notice) => (
        <Text key={notice} className="text-xs text-foreground-muted">
          {notice}
        </Text>
      ))}
    </View>
  );
}

export function ClaudeUsageSheet({ route }: StaticScreenProps<{ environmentId: EnvironmentId }>) {
  const { layout } = useAdaptiveWorkspaceLayout();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const content = (
    <ScrollView
      nestedScrollEnabled
      className="flex-1"
      contentInsetAdjustmentBehavior={Platform.OS === "ios" ? "automatic" : "never"}
      contentContainerClassName="px-5 pt-3"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
    >
      <ClaudeUsageContent environmentId={route.params.environmentId} />
    </ScrollView>
  );
  if (Platform.OS === "ios") {
    return (
      <View collapsable={false} className="flex-1 bg-sheet">
        <ScreenStack style={{ flex: 1 }}>
          <NativeScreen
            activityState={2}
            enabled
            isNativeStack
            screenId="claude-usage-sheet-native"
            scrollEdgeEffects={HEADER_SCROLL_EDGE_EFFECTS}
            className="flex-1 bg-sheet"
          >
            {content}
            <NativeHeader
              backgroundColor="rgba(0,0,0,0)"
              tintColorClassName="accent-foreground"
              hideBackButton
              hideShadow={false}
              title="Usage limits"
              titleColorClassName="accent-foreground"
              titleFontSize={18}
              titleFontWeight="800"
              translucent
            />
          </NativeScreen>
        </ScreenStack>
      </View>
    );
  }
  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      <NativeStackScreenOptions options={{ sheetCornerRadius: 28 }} />
      <AppBar sheet title="Usage limits" onBack={() => navigation.goBack()} />
      <ScreenContent insetHorizontal={layout.usesSplitView}>{content}</ScreenContent>
    </View>
  );
}
