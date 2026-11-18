import type { ProviderTeam, ProviderTeamId } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { UsersIcon } from "lucide-react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";
import { useComposerMenuProps } from "./composerEventScope";

const NO_TEAM = "";

/** Picks the provider team this thread leads; its members become delegate_task targets. */
export function TeamMenu(props: {
  teams: Readonly<Record<string, ProviderTeam>>;
  teamId: ProviderTeamId | null;
  disabled: boolean;
  onTeamChange: (teamId: ProviderTeamId | null) => void;
}) {
  const gt = useGT();
  const menuProps = useComposerMenuProps();
  const active = props.teamId === null ? undefined : props.teams[props.teamId];
  const label = active === undefined ? gt("No team") : active.name;

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7"
            aria-label={`${gt("Team")}: ${label}`}
            title={`${gt("Team")}: ${label}`}
          >
            <UsersIcon aria-hidden="true" className={active ? "text-foreground" : undefined} />
          </Button>
        }
      />
      <MenuPopup {...menuProps} side="top" align="end">
        <MenuGroup>
          <MenuGroupLabel>{gt("Team")}</MenuGroupLabel>
          <MenuRadioGroup
            value={active === undefined ? NO_TEAM : props.teamId}
            onValueChange={(value: string) =>
              props.onTeamChange(value === NO_TEAM ? null : (value as ProviderTeamId))
            }
          >
            <MenuRadioItem value={NO_TEAM} disabled={props.disabled}>
              {gt("No team")}
            </MenuRadioItem>
            {Object.entries(props.teams).map(([id, team]) => (
              <MenuRadioItem key={id} value={id} disabled={props.disabled}>
                {team.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
