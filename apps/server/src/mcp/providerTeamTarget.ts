import {
  findProviderTeamMember,
  type OrchestratorMcpTarget,
  type OrchestratorMcpTaskRole,
  type OrchestratorMcpTeamCapability,
  type ProviderInstanceId,
  type ProviderTeam,
  type ProviderTeamMember,
  type ServerProvider,
} from "@t3tools/contracts";

/** Reasons this instance cannot run `model` now; empty when it can. */
export type MemberConstraints = (provider: ServerProvider, model: string) => ReadonlyArray<string>;

const modelMatches = (provider: ServerProvider, model: string) => {
  const wanted = model.toLowerCase();
  return (
    provider.models.length === 0 ||
    provider.models.some(
      (candidate) =>
        candidate.slug.toLowerCase() === wanted ||
        candidate.aliases?.some((alias) => alias.toLowerCase() === wanted) === true,
    )
  );
};

/** A full window that has not reset yet; windows scoped to other models do not count. */
export const usageLimitReached = (provider: ServerProvider, model: string, nowMs: number) =>
  (provider.usageLimits?.windows ?? []).some(
    (window) =>
      window.usedPercent >= 100 &&
      (window.modelIds === undefined || window.modelIds.includes(model)) &&
      (window.resetsAt === undefined || Date.parse(window.resetsAt) > nowMs),
  );

/** The member's own instance when it can run, else another instance of the same driver with the model. */
const memberRunsOn = (
  member: ProviderTeamMember,
  providers: ReadonlyArray<ServerProvider>,
  constraints: MemberConstraints,
): { readonly runsOn: ProviderInstanceId | null; readonly constraints: ReadonlyArray<string> } => {
  const { instanceId, model } = member.modelSelection;
  const own = providers.find((provider) => provider.instanceId === instanceId);
  const ownConstraints =
    own === undefined
      ? [`Provider instance ${instanceId} is not registered.`]
      : constraints(own, model);
  if (ownConstraints.length === 0) return { runsOn: instanceId, constraints: [] };
  const standIn = providers.find(
    (provider) =>
      provider.instanceId !== instanceId &&
      (own === undefined || provider.driver === own.driver) &&
      modelMatches(provider, model) &&
      constraints(provider, model).length === 0,
  );
  return { runsOn: standIn?.instanceId ?? null, constraints: ownConstraints };
};

export type TeamMemberTarget =
  | {
      readonly _tag: "resolved";
      readonly target: OrchestratorMcpTarget;
      readonly role: OrchestratorMcpTaskRole | undefined;
    }
  | { readonly _tag: "failed"; readonly message: string };

/** Fills provider, model and options from the member; fields the caller set win. */
export const resolveTeamMemberTarget = (input: {
  readonly team: ProviderTeam | undefined;
  readonly target: OrchestratorMcpTarget;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly constraints: MemberConstraints;
}): TeamMemberTarget => {
  const { teamMember, ...rest } = input.target;
  if (teamMember === undefined) return { _tag: "resolved", target: rest, role: undefined };
  if (input.team === undefined) {
    return {
      _tag: "failed",
      message:
        "target.teamMember needs a team on this thread. Ask the user to pick one in the composer, or omit teamMember.",
    };
  }
  const member = findProviderTeamMember(input.team, teamMember);
  if (member === undefined) {
    const names = input.team.members.map((candidate) => candidate.name).join(", ");
    return {
      _tag: "failed",
      message: `Team ${input.team.name} has no member ${teamMember}. Members: ${names || "none"}.`,
    };
  }
  const { runsOn, constraints } = memberRunsOn(member, input.providers, input.constraints);
  if (runsOn === null) {
    return {
      _tag: "failed",
      message: `Member ${member.name} cannot run now and no other instance has ${member.modelSelection.model}: ${constraints.join(" ")}`,
    };
  }
  const ownsTarget = rest.providerInstanceId !== undefined || rest.driverKind !== undefined;
  return {
    _tag: "resolved",
    role: member.role,
    target: ownsTarget
      ? rest
      : {
          ...rest,
          providerInstanceId: runsOn,
          model: rest.model ?? member.modelSelection.model,
          ...(rest.options === undefined && member.modelSelection.options !== undefined
            ? { options: member.modelSelection.options }
            : {}),
        },
  };
};

export const teamCapability = (
  team: ProviderTeam,
  providers: ReadonlyArray<ServerProvider>,
  constraints: MemberConstraints,
): OrchestratorMcpTeamCapability => ({
  name: team.name,
  ...(team.guidance === undefined || team.guidance.trim() === ""
    ? {}
    : { guidance: team.guidance }),
  members: team.members.map((member) => ({
    name: member.name,
    ...(member.role === undefined ? {} : { role: member.role }),
    providerInstanceId: member.modelSelection.instanceId,
    model: member.modelSelection.model,
    ...memberRunsOn(member, providers, constraints),
  })),
});

/** Turn context for a thread that leads a team; providers without app context rely on capabilities. */
export const teamBriefing = (team: ProviderTeam): string =>
  [
    `You lead the T3 Code team "${team.name}". Split the user's request into tasks and hand them to members with delegate_task and target.teamMember; keep work that needs this conversation yourself.`,
    `Members: ${team.members
      .map(
        (member) =>
          `${member.name}${member.role === undefined ? "" : ` (${member.role})`}: ${member.modelSelection.instanceId}/${member.modelSelection.model}`,
      )
      .join("; ")}.`,
    "Give tasks that edit the same files to one member, or use isolation 'worktree'. Review results before you report back.",
    ...(team.guidance === undefined || team.guidance.trim() === "" ? [] : [team.guidance.trim()]),
  ].join("\n");
