import type { DesignFrameDevice, EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { designFrameSize } from "@t3tools/shared/design";
import { useGT } from "gt-react";
import { FrameIcon } from "lucide-react";
import { useState } from "react";

import { useDiscoveredPortsState } from "~/portDiscoveryState";
import { designEnvironment } from "~/state/design";
import { useAtomCommand } from "~/state/use-atom-command";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { buildFrameUrl } from "./frameUrl";

const DEVICES: ReadonlyArray<DesignFrameDevice> = ["desktop", "tablet", "mobile", "custom"];

export function AddFrameMenu(props: {
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef;
  readonly canWrite: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAdded: (nodeId: string) => void;
}) {
  const gt = useGT();
  const addFrame = useAtomCommand(designEnvironment.addFrame, { label: "design add frame" });
  const { servers } = useDiscoveredPortsState(props.environmentId);
  const [address, setAddress] = useState("");
  const [route, setRoute] = useState("/");
  const [device, setDevice] = useState<DesignFrameDevice>("desktop");
  const [customWidth, setCustomWidth] = useState("1280");
  const [customHeight, setCustomHeight] = useState("800");

  const url = buildFrameUrl(address, route);
  const size = designFrameSize(device, {
    width: Number(customWidth),
    height: Number(customHeight),
  });
  const deviceLabels: Record<DesignFrameDevice, string> = {
    desktop: gt("Desktop"),
    tablet: gt("Tablet"),
    mobile: gt("Mobile"),
    custom: gt("Custom"),
  };

  const submit = async () => {
    if (url === null) return;
    const result = await addFrame({
      environmentId: props.environmentId,
      input: {
        threadId: props.threadRef.threadId,
        url,
        device,
        ...(device === "custom" ? size : {}),
      },
    });
    if (result._tag !== "Success" || result.value === null) return;
    props.onAdded(result.value.id);
    props.onOpenChange(false);
  };

  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  aria-label={gt("Add Frame")}
                  size="icon-sm"
                  variant="ghost"
                  disabled={!props.canWrite}
                />
              }
            />
          }
        >
          <FrameIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="top">{gt("Add Frame")} · B</TooltipPopup>
      </Tooltip>
      <PopoverPopup side="top" sideOffset={8} width="md" data-design-add-frame>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-xs">{gt("Port or address")}</span>
            {servers.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {servers.map((server) => (
                  <Button
                    key={server.url}
                    type="button"
                    size="xs"
                    variant={address === String(server.port) ? "secondary" : "outline"}
                    onClick={() => setAddress(String(server.port))}
                  >
                    {server.processName ? `${server.port} · ${server.processName}` : server.port}
                  </Button>
                ))}
              </div>
            ) : null}
            <Input
              aria-label={gt("Port or address")}
              placeholder="5173"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-xs">{gt("Route")}</span>
            <Input
              aria-label={gt("Route")}
              placeholder="/"
              value={route}
              onChange={(event) => setRoute(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-xs">{gt("Size")}</span>
            <ToggleGroup
              aria-label={gt("Size")}
              value={[device]}
              onValueChange={(value) => {
                const next = DEVICES.find((entry) => entry === value[0]);
                if (next !== undefined) setDevice(next);
              }}
            >
              {DEVICES.map((entry) => (
                <Toggle key={entry} value={entry}>
                  {deviceLabels[entry]}
                </Toggle>
              ))}
            </ToggleGroup>
            {device === "custom" ? (
              <div className="flex items-center gap-1.5">
                <Input
                  aria-label={gt("Width")}
                  inputMode="numeric"
                  value={customWidth}
                  onChange={(event) => setCustomWidth(event.target.value)}
                />
                <span className="text-muted-foreground">×</span>
                <Input
                  aria-label={gt("Height")}
                  inputMode="numeric"
                  value={customHeight}
                  onChange={(event) => setCustomHeight(event.target.value)}
                />
              </div>
            ) : (
              <span className="text-muted-foreground text-xs">
                {size.width}×{size.height}
              </span>
            )}
          </div>
          <Button type="submit" size="sm" disabled={url === null}>
            {gt("Add Frame")}
          </Button>
        </form>
      </PopoverPopup>
    </Popover>
  );
}
