import { describe, expect, it } from "vite-plus/test";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { AgentAwarenessPhase, AgentAwarenessState } from "@t3tools/shared/agentAwareness";

import { agentAlertSnapshot, localAgentAlertTransitions } from "./localAgentAlerts";

function state(threadId: string, phase: AgentAwarenessPhase): AgentAwarenessState {
  return {
    environmentId: "env-1" as EnvironmentId,
    threadId: threadId as ThreadId,
    projectTitle: "RenanCode",
    threadTitle: `Thread ${threadId}`,
    phase,
    headline: "Agent finished",
    modelTitle: "haiku",
    updatedAt: "2026-10-30T12:00:00.000Z",
    deepLink: `/threads/env-1/${threadId}`,
  };
}

const loaded = new Set(["env-1"]);

describe("localAgentAlertTransitions", () => {
  it("alerts when a watched run finishes, fails, or needs the user", () => {
    const before = agentAlertSnapshot(
      [state("a", "running"), state("b", "running"), state("c", "starting")],
      loaded,
    );
    const alerts = localAgentAlertTransitions(before, [
      state("a", "completed"),
      state("b", "failed"),
      state("c", "waiting_for_approval"),
      state("d", "waiting_for_input"),
    ]);
    expect(alerts.map((alert) => alert.deepLink)).toEqual([
      "/threads/env-1/a",
      "/threads/env-1/b",
      "/threads/env-1/c",
      "/threads/env-1/d",
    ]);
  });

  it("stays quiet for replayed history and unchanged phases", () => {
    // The environment's first snapshot is history, even when it already waits on the user.
    expect(
      localAgentAlertTransitions(agentAlertSnapshot([], new Set()), [
        state("a", "waiting_for_approval"),
        state("b", "completed"),
      ]),
    ).toEqual([]);
    const before = agentAlertSnapshot([state("a", "waiting_for_approval")], loaded);
    expect(
      localAgentAlertTransitions(before, [
        state("a", "waiting_for_approval"),
        // A completion this app never saw running arrives with a reconnect.
        state("b", "completed"),
      ]),
    ).toEqual([]);
  });
});
