import { mcpServerNote } from "@t3tools/client-runtime/mcp-server-request";
import { mcpServerIsOn, type OrchestrationV2ProviderMcpServer } from "@t3tools/contracts";
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

export function McpServersMenu(props: {
  servers: ReadonlyArray<OrchestrationV2ProviderMcpServer>;
  enabledServers: ReadonlyArray<string>;
  disabled: boolean;
  onServerChange: (server: string, enabled: boolean) => void;
}) {
  const menuProps = useComposerMenuProps();
  const isOn = (server: OrchestrationV2ProviderMcpServer) =>
    mcpServerIsOn(server, props.enabledServers);
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
            const note = mcpServerNote(server, on);
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
