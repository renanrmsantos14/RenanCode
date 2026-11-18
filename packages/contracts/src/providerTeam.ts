import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";

export const PROVIDER_TEAM_MAX_MEMBERS = 24;

export const ProviderTeamId = TrimmedNonEmptyString.check(Schema.isMaxLength(64)).pipe(
  Schema.brand("ProviderTeamId"),
);
export type ProviderTeamId = typeof ProviderTeamId.Type;

/** Same values as `OrchestratorMcpTaskRole`; kept here so settings do not import the MCP contracts. */
export const ProviderTeamRole = Schema.Literals([
  "implementation",
  "research",
  "review",
  "design",
  "test",
  "general",
]);
export type ProviderTeamRole = typeof ProviderTeamRole.Type;

export const ProviderTeamMember = Schema.Struct({
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(64)),
  role: Schema.optional(ProviderTeamRole),
  modelSelection: ModelSelection,
});
export type ProviderTeamMember = typeof ProviderTeamMember.Type;

export const ProviderTeam = Schema.Struct({
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(128)),
  members: Schema.Array(ProviderTeamMember).check(Schema.isMaxLength(PROVIDER_TEAM_MAX_MEMBERS)),
  /** Extra instructions for the thread that leads the team. */
  guidance: Schema.optional(Schema.String.check(Schema.isMaxLength(4_000))),
});
export type ProviderTeam = typeof ProviderTeam.Type;

export const findProviderTeamMember = (
  team: ProviderTeam,
  name: string,
): ProviderTeamMember | undefined => {
  const wanted = name.trim().toLowerCase();
  return team.members.find((member) => member.name.toLowerCase() === wanted);
};
