import { WORK_MODULE_STATUSES, type WorkModuleStatus } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { Popover, PopoverPopup } from "~/components/ui/popover";

import { WORK_STATUS_BADGE, WORK_STATUS_LABEL } from "./workStatus";

export function WorkStatusMenu(props: {
  status: WorkModuleStatus;
  waitingReason: string | null;
  onChange: (next: { status: WorkModuleStatus; waitingReason: string | null }) => void;
  disabled?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [reasonRequested, setReasonRequested] = useState(false);
  const [askingReason, setAskingReason] = useState(false);
  const [reason, setReason] = useState(props.waitingReason ?? "");
  const label = WORK_STATUS_LABEL[props.status];
  return (
    <>
      {/* Opens the reason popover after the menu closes, so its focus return cannot dismiss it. */}
      <Menu
        onOpenChangeComplete={(open) => {
          if (open || !reasonRequested) return;
          setReasonRequested(false);
          setAskingReason(true);
        }}
      >
        <MenuTrigger
          ref={triggerRef}
          disabled={props.disabled}
          aria-label={`Status: ${label}`}
          render={<button type="button" />}
        >
          <Badge variant={WORK_STATUS_BADGE[props.status]} size="sm">
            {label}
          </Badge>
        </MenuTrigger>
        <MenuPopup align="start">
          {WORK_MODULE_STATUSES.map((status) => (
            <MenuItem
              key={status}
              onClick={() =>
                status === "waiting"
                  ? setReasonRequested(true)
                  : props.onChange({ status, waitingReason: null })
              }
            >
              {WORK_STATUS_LABEL[status]}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
      <Popover open={askingReason} onOpenChange={setAskingReason}>
        <PopoverPopup anchor={triggerRef} align="start" padding="compact" width="sm">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = reason.trim();
              if (trimmed === "") return;
              setAskingReason(false);
              props.onChange({ status: "waiting", waitingReason: trimmed });
            }}
          >
            <Input
              aria-label="Esperando o quê"
              placeholder="Esperando o quê…"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              autoFocus
            />
          </form>
        </PopoverPopup>
      </Popover>
    </>
  );
}
