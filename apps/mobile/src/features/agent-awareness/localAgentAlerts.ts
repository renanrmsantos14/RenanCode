import type { AgentAwarenessPhase, AgentAwarenessState } from "@t3tools/shared/agentAwareness";

import type { AgentActivityProps, AgentActivityRowProps } from "../../widgets/AgentActivity";

export interface AgentAlertSnapshot {
  readonly phases: ReadonlyMap<string, AgentAwarenessPhase>;
  /** Environments whose threads had loaded; anything else is still replaying history. */
  readonly environments: ReadonlySet<string>;
}

export interface LocalAgentAlert {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink: string;
}

const ACTIVE_PHASES: ReadonlySet<AgentAwarenessPhase> = new Set(["starting", "running"]);
const ATTENTION_PHASES: ReadonlySet<AgentAwarenessPhase> = new Set([
  "waiting_for_approval",
  "waiting_for_input",
]);
const MAX_WIDGET_ROWS = 4;

const STATUS_BY_PHASE: Record<AgentAwarenessPhase, string> = {
  starting: "Connecting",
  running: "Working",
  waiting_for_approval: "Approval",
  waiting_for_input: "Input",
  stale: "Waiting",
  completed: "Done",
  failed: "Failed",
};

export function agentPhaseKey(state: Pick<AgentAwarenessState, "environmentId" | "threadId">) {
  return JSON.stringify([state.environmentId, state.threadId]);
}

export function agentAlertSnapshot(
  states: ReadonlyArray<AgentAwarenessState>,
  environments: ReadonlySet<string>,
): AgentAlertSnapshot {
  return {
    phases: new Map(states.map((state) => [agentPhaseKey(state), state.phase])),
    environments,
  };
}

// An environment's first loaded snapshot describes the past, so it never alerts.
// Completion and failure alert only for runs this app saw working, so a reconnect replay stays quiet.
export function localAgentAlertTransitions(
  previous: AgentAlertSnapshot,
  next: ReadonlyArray<AgentAwarenessState>,
): ReadonlyArray<LocalAgentAlert> {
  const alerts: LocalAgentAlert[] = [];
  for (const state of next) {
    if (!previous.environments.has(String(state.environmentId))) continue;
    const before = previous.phases.get(agentPhaseKey(state));
    if (before === state.phase) continue;
    const entersAttention = ATTENTION_PHASES.has(state.phase);
    const finishesSeenRun =
      (state.phase === "completed" || state.phase === "failed") &&
      before !== undefined &&
      (ACTIVE_PHASES.has(before) || ATTENTION_PHASES.has(before));
    if (!entersAttention && !finishesSeenRun) continue;
    alerts.push({
      id: `local-agent:${agentPhaseKey(state)}:${state.phase}`,
      title: `${state.headline} · ${state.projectTitle}`,
      body: state.threadTitle,
      deepLink: state.deepLink,
    });
  }
  return alerts;
}

export function localAgentActivityProps(
  states: ReadonlyArray<AgentAwarenessState>,
): AgentActivityProps {
  const rows: AgentActivityRowProps[] = [...states]
    .sort((a, b) => rowRank(a.phase) - rowRank(b.phase) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_WIDGET_ROWS)
    .map((state) => ({
      environmentId: String(state.environmentId),
      threadId: String(state.threadId),
      projectTitle: state.projectTitle,
      threadTitle: state.threadTitle,
      modelTitle: state.modelTitle,
      phase: state.phase,
      status: STATUS_BY_PHASE[state.phase],
      updatedAt: state.updatedAt,
      deepLink: state.deepLink,
    }));
  const activeCount = states.filter(
    (state) => ACTIVE_PHASES.has(state.phase) || ATTENTION_PHASES.has(state.phase),
  ).length;
  return {
    title: "T3 Code",
    subtitle: activeCount > 0 ? `${activeCount} active` : "No active agents",
    activeCount,
    updatedAt: states.reduce(
      (latest, state) => (state.updatedAt > latest ? state.updatedAt : latest),
      "",
    ),
    activities: rows,
  };
}

function rowRank(phase: AgentAwarenessPhase): number {
  if (ATTENTION_PHASES.has(phase)) return 0;
  if (ACTIVE_PHASES.has(phase)) return 1;
  return 2;
}
