import { Button, Column, getMaterialColors, Text } from "@expo/ui/jetpack-compose";
import { fillMaxSize, fillMaxWidth, padding, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { AgentActivityProps } from "./AgentActivity";
import type { WidgetTheme } from "./widgetTheme";

export type AgentActivityWidgetProps = Partial<AgentActivityProps> & {
  readonly theme?: WidgetTheme;
};

export function AgentActivityWidget(
  props: AgentActivityWidgetProps,
  environment: WidgetEnvironment,
) {
  "widget";
  // The widget runtime evaluates this function without the app's module scope.
  const mode = props.theme?.mode;
  const appearance =
    mode === "light" || mode === "dark"
      ? mode
      : environment.colorScheme === "dark"
        ? "dark"
        : "light";
  const palette = props.theme?.[appearance];
  const colors = palette
    ? {
        surface: palette.background,
        onSurface: palette.foreground,
        onSurfaceVariant: palette.secondary,
        primary: palette.accent,
        error: palette.danger,
      }
    : getMaterialColors({ scheme: appearance });
  const muted = colors.onSurfaceVariant;
  const activities = props.activities ?? [];
  return (
    // Android lacks widgetURL; one card Button routes taps to the app listener.
    <Button
      colors={{ containerColor: colors.surface }}
      modifiers={[fillMaxSize()]}
      onClick={() => {}}
    >
      <Column modifiers={[fillMaxSize(), paddingAll(14)]}>
        <Text color={colors.onSurface} maxLines={1} style={{ fontSize: 13, fontWeight: "bold" }}>
          {props.title ? `${props.title} · ${props.subtitle ?? ""}` : "T3 Code"}
        </Text>
        {activities.length === 0 ? (
          <Text color={muted} maxLines={1} style={{ fontSize: 11 }}>
            {props.title ? "No agent activity" : "Open T3 to connect"}
          </Text>
        ) : null}
        {activities.map((row) => {
          const attention =
            row.phase === "waiting_for_approval" || row.phase === "waiting_for_input";
          const statusColor =
            row.phase === "failed" ? colors.error : attention ? colors.primary : muted;
          return (
            <Column key={row.deepLink} modifiers={[fillMaxWidth(), padding(0, 6, 0, 0)]}>
              <Text color={colors.onSurface} maxLines={1} style={{ fontSize: 12 }}>
                {row.threadTitle}
              </Text>
              <Text color={statusColor} maxLines={1} style={{ fontSize: 10 }}>
                {`${row.status} · ${row.projectTitle}`}
              </Text>
            </Column>
          );
        })}
      </Column>
    </Button>
  );
}

export default createWidget("AgentActivity", AgentActivityWidget);
