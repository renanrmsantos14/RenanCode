import {
  type EnvironmentId,
  PROVIDER_TEAM_MAX_MEMBERS,
  type ProviderTeam,
  type ProviderTeamId,
  type ProviderTeamMember,
  type ProviderTeamRole,
  type ServerProvider,
} from "@t3tools/contracts";
import { pickModelSelection } from "@t3tools/shared/model";
import { useGT } from "gt-react";
import { MoreVertical, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { getTextGenerationModelOptionsByInstance } from "../../modelSelection";
import { providerInstanceEntriesFor } from "../../providerInstances";
import { ProviderModelPicker } from "../chat/ProviderModelPicker";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { nextProviderTeamId, providerTeamDraftProblem } from "./ProviderTeamsSettings.logic";
import { searchableSetting } from "./settingsSearch";
import { SETTINGS_PICKER_TRIGGER_CLASSNAME, SettingsRow, SettingsSection } from "./settingsLayout";

type Editing = { readonly id: ProviderTeamId; readonly team: ProviderTeam } | "new";

const ROLES: ReadonlyArray<ProviderTeamRole> = [
  "general",
  "implementation",
  "research",
  "review",
  "design",
  "test",
];

/** Named rosters a thread can lead: each member is a provider, model and optional role. */
export function ProviderTeamsSettings({
  environmentId,
  providers,
  readOnly,
}: {
  readonly environmentId: EnvironmentId;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly readOnly: boolean;
}) {
  const gt = useGT();
  const settings = useEnvironmentSettings(environmentId);
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const teams = Object.entries(settings.providerTeams) as Array<[ProviderTeamId, ProviderTeam]>;

  return (
    <>
      <SettingsSection
        {...searchableSetting("provider-teams")}
        title={gt("Teams")}
        headerAction={
          readOnly ? null : (
            <Button size="xs" variant="outline" onClick={() => setEditing("new")}>
              <PlusIcon className="size-3" aria-hidden />
              {gt("Add team")}
            </Button>
          )
        }
      >
        {teams.length === 0 ? (
          <SettingsRow
            title={gt("No teams yet")}
            description={gt(
              "A team lists the providers and models a thread can hand tasks to. Pick one in the composer to have the thread lead it.",
            )}
          />
        ) : null}
        {teams.map(([id, team]) => (
          <SettingsRow
            key={id}
            title={team.name}
            description={team.members
              .map((member) => `${member.name} · ${member.modelSelection.model}`)
              .join(", ")}
            control={
              readOnly ? null : (
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost-muted"
                        aria-label={gt("Team actions")}
                      />
                    }
                  >
                    <MoreVertical />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuItem onClick={() => setEditing({ id, team })}>{gt("Edit")}</MenuItem>
                    <MenuItem
                      variant="destructive"
                      onClick={() => updateSettings({ providerTeams: { [id]: null } })}
                    >
                      {gt("Remove")}
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              )
            }
          />
        ))}
      </SettingsSection>
      {editing !== null ? (
        <ProviderTeamDialog
          environmentId={environmentId}
          providers={providers}
          initial={editing === "new" ? null : editing.team}
          onClose={() => setEditing(null)}
          onSave={(team) => {
            const id =
              editing === "new"
                ? nextProviderTeamId(team.name, Object.keys(settings.providerTeams))
                : editing.id;
            updateSettings({ providerTeams: { [id]: team } });
            setEditing(null);
          }}
        />
      ) : null}
    </>
  );
}

function ProviderTeamDialog({
  environmentId,
  providers,
  initial,
  onClose,
  onSave,
}: {
  readonly environmentId: EnvironmentId;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly initial: ProviderTeam | null;
  readonly onClose: () => void;
  readonly onSave: (team: ProviderTeam) => void;
}) {
  const gt = useGT();
  const settings = useEnvironmentSettings(environmentId);
  const instanceEntries = providerInstanceEntriesFor(providers, settings, null);
  const [name, setName] = useState(initial?.name ?? "");
  const [guidance, setGuidance] = useState(initial?.guidance ?? "");
  const [members, setMembers] = useState<ReadonlyArray<ProviderTeamMember>>(initial?.members ?? []);
  const defaultSelection = settings.defaultModelSelection ?? members[0]?.modelSelection ?? null;
  const draft: ProviderTeam = {
    name: name.trim(),
    members: members.map((member) => ({ ...member, name: member.name.trim() })),
    ...(guidance.trim() === "" ? {} : { guidance: guidance.trim() }),
  };
  const problem = providerTeamDraftProblem(draft);
  const problemText =
    problem === "name"
      ? gt("Name the team.")
      : problem === "members"
        ? gt("Add at least one member.")
        : problem === "member-name"
          ? gt("Every member needs a name.")
          : problem === "duplicate-member"
            ? gt("Member names must differ.")
            : null;
  const setMember = (index: number, next: ProviderTeamMember) =>
    setMembers((current) => current.map((member, at) => (at === index ? next : member)));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial === null ? gt("Add a team") : gt("Edit team")}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="provider-team-name">{gt("Name")}</Label>
              <Input
                id="provider-team-name"
                value={name}
                maxLength={128}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{gt("Members")}</span>
              {members.map((member, index) => (
                <div
                  // oxlint-disable-next-line react/no-array-index-key -- members have no id until saved, and names change while typing.
                  key={index}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2"
                >
                  <Input
                    aria-label={gt("Member name")}
                    value={member.name}
                    maxLength={64}
                    onChange={(event) => setMember(index, { ...member, name: event.target.value })}
                  />
                  <Select
                    value={member.role ?? "general"}
                    onValueChange={(value) => {
                      const { role: _role, ...rest } = member;
                      setMember(
                        index,
                        value === "general" ? rest : { ...rest, role: value as ProviderTeamRole },
                      );
                    }}
                  >
                    <SelectTrigger size="sm" className="w-36" aria-label={gt("Role")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup align="end" alignItemWithTrigger={false}>
                      {ROLES.map((role) => (
                        <SelectItem key={role} hideIndicator value={role}>
                          {roleLabel(gt, role)}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                  <ProviderModelPicker
                    environmentId={environmentId}
                    activeInstanceId={member.modelSelection.instanceId}
                    model={member.modelSelection.model}
                    lockedProvider={null}
                    instanceEntries={instanceEntries}
                    modelOptionsByInstance={getTextGenerationModelOptionsByInstance(
                      settings,
                      providers,
                      member.modelSelection.instanceId,
                      member.modelSelection.model,
                    )}
                    triggerClassName={SETTINGS_PICKER_TRIGGER_CLASSNAME}
                    triggerAriaLabel={gt("Member model")}
                    onInstanceModelChange={(instanceId, model) =>
                      setMember(index, {
                        ...member,
                        modelSelection: pickModelSelection(
                          member.modelSelection,
                          instanceId,
                          model,
                        ),
                      })
                    }
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost-muted"
                    aria-label={gt("Remove member")}
                    onClick={() => setMembers((current) => current.filter((_, at) => at !== index))}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </div>
              ))}
              <div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={
                    defaultSelection === null || members.length >= PROVIDER_TEAM_MAX_MEMBERS
                  }
                  onClick={() => {
                    if (defaultSelection === null) return;
                    setMembers((current) => [
                      ...current,
                      { name: "", modelSelection: defaultSelection },
                    ]);
                  }}
                >
                  <PlusIcon className="size-3" aria-hidden />
                  {gt("Add member")}
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="provider-team-guidance">{gt("Lead guidance")}</Label>
              <Textarea
                id="provider-team-guidance"
                value={guidance}
                maxLength={4_000}
                placeholder={gt("Optional. How the lead should split and review work.")}
                onChange={(event) => setGuidance(event.target.value)}
              />
            </div>
            {problemText === null ? null : (
              <p className="text-sm text-muted-foreground">{problemText}</p>
            )}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {gt("Cancel")}
          </Button>
          <Button disabled={problem !== null} onClick={() => onSave(draft)}>
            {gt("Save")}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function roleLabel(gt: ReturnType<typeof useGT>, role: ProviderTeamRole): string {
  switch (role) {
    case "general":
      return gt("Any task");
    case "implementation":
      return gt("Implementation");
    case "research":
      return gt("Research");
    case "review":
      return gt("Review");
    case "design":
      return gt("Design");
    case "test":
      return gt("Testing");
  }
}
