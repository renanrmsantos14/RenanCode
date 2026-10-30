import type { OrchestrationV2ProviderMcpServer } from "@t3tools/contracts";
import { PlugIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";
import { composerFloatingLayerProps } from "./composerEventScope";

const STATUS_LABELS: Partial<Record<OrchestrationV2ProviderMcpServer["status"], string>> = {
  failed: "Failed",
  "needs-auth": "Needs sign-in",
  pending: "Connecting",
};

export function McpServersMenu(props: {
  servers: ReadonlyArray<OrchestrationV2ProviderMcpServer>;
  enabledServers: ReadonlyArray<string>;
  disabled: boolean;
  onEnabledServersChange: (names: ReadonlyArray<string>) => void;
}) {
  const enabled = new Set(props.enabledServers);
  const onCount = props.servers.filter(
    (server) => server.alwaysOn === true || enabled.has(server.name),
  ).length;
  const setServer = (name: string, on: boolean) =>
    props.onEnabledServersChange(
      on ? [...props.enabledServers, name] : props.enabledServers.filter((entry) => entry !== name),
    );

  return (
    <Popover>
      <PopoverTrigger
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
      <PopoverPopup
        {...composerFloatingLayerProps}
        side="top"
        align="end"
        padding="none"
        width="sm"
        className="text-left whitespace-normal"
      >
        <div className="flex flex-col gap-1 p-(--floating-content-inset)">
          <div className="font-medium text-muted-foreground text-xs">MCP servers</div>
          {props.servers.length === 0 ? (
            <div className="text-pretty text-secondary-label text-2xs">
              No MCP servers configured.
            </div>
          ) : (
            props.servers.map((server) => {
              const on = server.alwaysOn === true || enabled.has(server.name);
              const applied = server.status !== "disabled";
              const note =
                server.alwaysOn === true
                  ? "Always on in settings"
                  : on !== applied
                    ? "Applies on next message"
                    : on
                      ? STATUS_LABELS[server.status]
                      : undefined;
              return (
                <label
                  key={server.name}
                  className="flex min-h-8 cursor-pointer items-center justify-between gap-3 text-xs"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{server.name}</span>
                    {note ? <span className="text-secondary-label text-2xs">{note}</span> : null}
                  </span>
                  <Switch
                    size="sm"
                    checked={on}
                    disabled={props.disabled || server.alwaysOn === true}
                    onCheckedChange={(checked) => setServer(server.name, Boolean(checked))}
                  />
                </label>
              );
            })
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
