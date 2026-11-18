import { assert, describe, it } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderTeam,
  type ServerProvider,
} from "@t3tools/contracts";

import {
  resolveTeamMemberTarget,
  usageLimitReached,
  type MemberConstraints,
} from "./providerTeamTarget.ts";

const now = Date.parse("2026-11-18T12:00:00.000Z");

const provider = (
  instanceId: string,
  driver: string,
  model: string,
  overrides: Partial<ServerProvider> = {},
): ServerProvider => ({
  instanceId: ProviderInstanceId.make(instanceId),
  driver: ProviderDriverKind.make(driver),
  enabled: true,
  installed: true,
  version: "test",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: "2026-11-18T00:00:00.000Z",
  models: [{ slug: model, name: model, isCustom: false, capabilities: null }],
  slashCommands: [],
  skills: [],
  ...overrides,
});

const team: ProviderTeam = {
  name: "Squad",
  members: [
    {
      name: "Reviewer",
      role: "review",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex"),
        model: "gpt-5.5",
        options: [{ id: "effort", value: "high" }],
      },
    },
  ],
};

const constraints: MemberConstraints = (candidate, model) => [
  ...(candidate.status === "error" ? ["Provider status is error."] : []),
  ...(usageLimitReached(candidate, model, now) ? ["Usage limit reached."] : []),
];

const limited = {
  usageLimits: {
    checkedAt: "2026-11-18T11:00:00.000Z",
    windows: [
      {
        id: "session",
        kind: "session" as const,
        label: "Session",
        usedPercent: 100,
        resetsAt: "2026-11-18T13:00:00.000Z",
      },
    ],
  },
};

describe("resolveTeamMemberTarget", () => {
  it.each([
    {
      name: "uses the member's own instance, model and options",
      providers: [provider("codex", "codex", "gpt-5.5"), provider("codex-2", "codex", "gpt-5.5")],
      target: { teamMember: "reviewer" },
      expected: {
        providerInstanceId: "codex",
        model: "gpt-5.5",
        options: [{ id: "effort", value: "high" }],
      },
    },
    {
      name: "fails over to another instance of the driver when the member's hit its limit",
      providers: [
        provider("codex", "codex", "gpt-5.5", limited),
        provider("claude", "claude", "gpt-5.5"),
        provider("codex-2", "codex", "gpt-5.5"),
      ],
      target: { teamMember: "Reviewer" },
      expected: {
        providerInstanceId: "codex-2",
        model: "gpt-5.5",
        options: [{ id: "effort", value: "high" }],
      },
    },
    {
      name: "keeps the member's instance after a limit resets",
      providers: [
        provider("codex", "codex", "gpt-5.5", {
          usageLimits: {
            ...limited.usageLimits,
            windows: [{ ...limited.usageLimits.windows[0]!, resetsAt: "2026-11-18T11:30:00.000Z" }],
          },
        }),
        provider("codex-2", "codex", "gpt-5.5"),
      ],
      target: { teamMember: "Reviewer" },
      expected: {
        providerInstanceId: "codex",
        model: "gpt-5.5",
        options: [{ id: "effort", value: "high" }],
      },
    },
    {
      name: "lets explicit fields win over the member",
      providers: [provider("codex", "codex", "gpt-5.5")],
      target: { teamMember: "Reviewer", model: "gpt-5.5-mini", options: [] },
      expected: { providerInstanceId: "codex", model: "gpt-5.5-mini", options: [] },
    },
  ])("$name", ({ providers, target, expected }) => {
    const resolved = resolveTeamMemberTarget({ team, target, providers, constraints });
    assert.deepEqual(resolved, { _tag: "resolved", role: "review", target: expected } as never);
  });

  it.each([
    {
      name: "no team on the thread",
      team: undefined,
      providers: [provider("codex", "codex", "gpt-5.5")],
      member: "Reviewer",
      message: /needs a team/,
    },
    {
      name: "unknown member",
      team,
      providers: [provider("codex", "codex", "gpt-5.5")],
      member: "Tester",
      message: /no member Tester\. Members: Reviewer/,
    },
    {
      name: "no instance can run the model",
      team,
      providers: [
        provider("codex", "codex", "gpt-5.5", limited),
        provider("codex-2", "codex", "gpt-5.5", { status: "error" }),
      ],
      member: "Reviewer",
      message: /cannot run now.*Usage limit reached/,
    },
  ])("fails with $name", ({ team: thisTeam, providers, member, message }) => {
    const resolved = resolveTeamMemberTarget({
      team: thisTeam,
      target: { teamMember: member },
      providers,
      constraints,
    });
    assert.strictEqual(resolved._tag, "failed");
    if (resolved._tag === "failed") assert.match(resolved.message, message);
  });
});
