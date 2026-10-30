import type { OrchestrationV2ProviderMcpServer } from "@t3tools/contracts";
import { PlugIcon } from "lucide-react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuTrigger,
} from "../ui/menu";
import { useComposerMenuProps } from "./composerEventScope";

const STATUS_LABELS: Partial<Record<OrchestrationV2ProviderMcpServer["status"], string>> = {
  failed: "Failed",
  "needs-auth": "Needs sign-in",
  pending: "Connecting",
};

function serverNote(server: OrchestrationV2ProviderMcpServer, on: boolean): string | undefined {
  if (server.alwaysOn) return "Always on in settings";
  if (on !== (server.status !== "disabled")) return "Applies on next message";
  return on ? STATUS_LABELS[server.status] : undefined;
}

export function McpServersMenu(props: {
  servers: ReadonlyArray<OrchestrationV2ProviderMcpServer>;
  enabledServers: ReadonlyArray<string>;
  disabled: boolean;
  onServerChange: (server: string, enabled: boolean) => void;
}) {
  const menuProps = useComposerMenuProps();
  const enabled = new Set(props.enabledServers);
  const isOn = (server: OrchestrationV2ProviderMcpServer) =>
    server.alwaysOn || enabled.has(server.name);
  const onCount = props.servers.filter(isOn).length;

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7"
            aria-label={`MCP servers, ${onCount} on`}
          >
            <PlugIcon aria-hidden="true" className={onCount > 0 ? "text-foreground" : undefined} />
          </Button>
        }
      />
      <MenuPopup {...menuProps} side="top" align="end">
        <MenuGroup>
          <MenuGroupLabel>MCP servers</MenuGroupLabel>
          {props.servers.map((server) => {
            const on = isOn(server);
            const note = serverNote(server, on);
            return (
              <MenuCheckboxItem
                key={server.name}
                variant="switch"
                checked={on}
                disabled={props.disabled || server.alwaysOn}
                onCheckedChange={(checked) => props.onServerChange(server.name, checked)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{server.name}</span>
                  {note ? <span className="text-secondary-label text-2xs">{note}</span> : null}
                </span>
              </MenuCheckboxItem>
            );
          })}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
