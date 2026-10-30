import { useAtomValue } from "@effect/atom-react";
import { type AgentAwarenessState, projectThreadAwarenessV2 } from "@t3tools/shared/agentAwareness";
import { Atom } from "effect/reactivity";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { environmentProjects } from "../../state/projects";
import { environmentThreadShells } from "../../state/threads";
import { publishAgentActivity } from "../../widgets/publishAgentActivity";
import { createWidgetTheme } from "../../widgets/widgetTheme";
import { usesLocalAgentAlerts } from "./capabilities";
import {
  agentAlertSnapshot,
  type AgentAlertSnapshot,
  localAgentActivityProps,
  localAgentAlertTransitions,
} from "./localAgentAlerts";

const ALERT_CHANNEL_ID = "agent-alerts";

interface Awareness {
  readonly states: ReadonlyArray<AgentAwarenessState>;
  readonly environments: ReadonlySet<string>;
}

// Streaming bumps updatedAt constantly; only phase and title changes should reach alerts and the widget.
const awarenessAtom = Atom.make((get): Awareness => {
  const shells = get(environmentThreadShells.threadShellsAtom);
  const projects = get(environmentProjects.projectsAtom);
  const titles = new Map(
    projects.map((project) => [`${project.environmentId}:${project.id}`, project.title]),
  );
  const states = shells.flatMap((shell) => {
    if (shell.archivedAt !== null || shell.deletedAt !== null) return [];
    const title = titles.get(`${shell.environmentId}:${shell.projectId}`);
    if (title === undefined) return [];
    const state = projectThreadAwarenessV2({
      environmentId: shell.environmentId,
      project: { title },
      thread: shell.source,
    });
    return state === null ? [] : [state];
  });
  return {
    states,
    environments: new Set(shells.map((shell) => String(shell.environmentId))),
  };
}).pipe(
  Atom.withEquality(
    (a: Awareness, b: Awareness) =>
      a.environments.size === b.environments.size &&
      [...a.environments].every((id) => b.environments.has(id)) &&
      JSON.stringify(a.states.map(({ updatedAt: _a, ...rest }) => rest)) ===
        JSON.stringify(b.states.map(({ updatedAt: _b, ...rest }) => rest)),
  ),
);

export function LocalAgentAlertsCoordinator() {
  const awareness = useAtomValue(awarenessAtom);
  const previous = useRef<AgentAlertSnapshot | null>(null);
  const { themeMode, themeVariablesByAppearance } = useAppearancePreferences();

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- posts OS notifications for agent phase transitions
  useEffect(() => {
    const before = previous.current;
    previous.current = agentAlertSnapshot(awareness.states, awareness.environments);
    if (before === null || !usesLocalAgentAlerts()) return;
    const alerts = localAgentAlertTransitions(before, awareness.states);
    if (alerts.length === 0) return;
    void (async () => {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
          name: "Agent alerts",
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      for (const alert of alerts) {
        await Notifications.scheduleNotificationAsync({
          identifier: alert.id,
          content: { title: alert.title, body: alert.body, data: { deepLink: alert.deepLink } },
          trigger: Platform.OS === "android" ? { channelId: ALERT_CHANNEL_ID } : null,
        });
      }
    })().catch((error: unknown) => {
      console.warn("Could not show agent notification", error);
    });
  }, [awareness]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- publishes agent activity to the native home screen widget
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void publishAgentActivity({
      ...localAgentActivityProps(awareness.states),
      theme: createWidgetTheme(themeMode, themeVariablesByAppearance),
    }).catch((error: unknown) => {
      console.warn("Could not update agent activity widget", error);
    });
  }, [awareness, themeMode, themeVariablesByAppearance]);

  return null;
}
