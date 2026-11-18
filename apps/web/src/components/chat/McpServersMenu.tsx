import { mcpServerNote, splitMcpServers } from "@t3tools/client-runtime/mcp-server-request";
import { mcpServerIsOn, type OrchestrationV2ProviderMcpServer } from "@t3tools/contracts";
import { T, useGT, useMessages, Var } from "gt-react";
import { PlugIcon, StarIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { useComposerMenuProps } from "./composerEventScope";

export function McpServersMenu(props: {
  servers: ReadonlyArray<OrchestrationV2ProviderMcpServer>;
  enabledServers: ReadonlyArray<string>;
  pinnedServers: ReadonlyArray<string>;
  disabled: boolean;
  onServerChange: (server: string, enabled: boolean) => void;
  onServerPinnedChange: (server: string, pinned: boolean) => void;
}) {
  const menuProps = useComposerMenuProps();
  const gt = useGT();
  const m = useMessages();
  const isOn = (server: OrchestrationV2ProviderMcpServer) =>
    mcpServerIsOn(server, props.enabledServers);
  const onCount = props.servers.filter(isOn).length;
  const { shown, more } = splitMcpServers(props.servers, props.enabledServers, props.pinnedServers);

  const row = (server: OrchestrationV2ProviderMcpServer) => {
    const on = isOn(server);
    const note = mcpServerNote(server, on, m);
    const pinned = props.pinnedServers.includes(server.name);
    const pinLabel = pinned
      ? gt("Unpin {server}", { server: server.name })
      : gt("Pin {server}", { server: server.name });
    return (
      <MenuCheckboxItem
        key={server.name}
        variant="switch"
        checked={on}
        disabled={props.disabled || server.alwaysOn}
        onCheckedChange={(checked) => props.onServerChange(server.name, checked)}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{server.name}</span>
            {note ? <span className="text-secondary-label text-2xs">{note}</span> : null}
          </span>
          {/* Pinning works even while the switch is locked, so it sits outside the disabled hit area. */}
          <Button
            size="icon-xs"
            variant="ghost-muted"
            className="pointer-events-auto ms-auto"
            aria-label={pinLabel}
            title={pinLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              props.onServerPinnedChange(server.name, !pinned);
            }}
          >
            <StarIcon
              aria-hidden="true"
              className={cn(
                "size-3",
                pinned
                  ? "fill-current text-warning"
                  : "opacity-0 in-data-highlighted:opacity-100 pointer-coarse:opacity-100",
              )}
            />
          </Button>
        </span>
      </MenuCheckboxItem>
    );
  };

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost-muted"
            className="size-7"
            aria-label={gt("MCP servers, {count} on", { count: onCount })}
          >
            <PlugIcon aria-hidden="true" className={onCount > 0 ? "text-foreground" : undefined} />
          </Button>
        }
      />
      <MenuPopup {...menuProps} side="top" align="end">
        <MenuGroup>
          <MenuGroupLabel>
            <T>MCP servers</T>
          </MenuGroupLabel>
          {shown.map(row)}
          {more.length > 0 ? (
            <MenuSub>
              <MenuSubTrigger>
                <T>
                  More servers (<Var>{more.length}</Var>)
                </T>
              </MenuSubTrigger>
              <MenuSubPopup>{more.map(row)}</MenuSubPopup>
            </MenuSub>
          ) : null}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
