import { type ProviderTeam, ProviderTeamId } from "@t3tools/contracts";

export type ProviderTeamDraftProblem = "name" | "members" | "member-name" | "duplicate-member";

export function providerTeamDraftProblem(team: ProviderTeam): ProviderTeamDraftProblem | null {
  if (team.name === "") return "name";
  if (team.members.length === 0) return "members";
  if (team.members.some((member) => member.name === "")) return "member-name";
  const names = new Set(team.members.map((member) => member.name.toLowerCase()));
  return names.size === team.members.length ? null : "duplicate-member";
}

/** A readable id from the name, numbered past ids already taken. */
export function nextProviderTeamId(name: string, taken: ReadonlyArray<string>): ProviderTeamId {
  const base =
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "team";
  let id = base;
  for (let suffix = 2; taken.includes(id); suffix += 1) id = `${base}-${suffix}`;
  return ProviderTeamId.make(id);
}
