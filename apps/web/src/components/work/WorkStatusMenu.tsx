import { WORK_MODULE_STATUSES, type WorkModuleStatus } from "@t3tools/contracts";
import { useRef, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";

import { WORK_STATUS_BADGE, WORK_STATUS_LABEL } from "./workStatus";
import { WorkWaitingReasonPrompt } from "./WorkWaitingReasonPrompt";

interface WorkStatusControlProps {
  status: WorkModuleStatus;
  waitingReason: string | null;
  onChange: (next: { status: WorkModuleStatus; waitingReason: string | null }) => void;
  disabled?: boolean;
}

export function WorkStatusMenu(props: WorkStatusControlProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [reasonRequested, setReasonRequested] = useState(false);
  const [askingReason, setAskingReason] = useState(false);
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
      <WorkWaitingReasonPrompt
        open={askingReason}
        initial={props.waitingReason ?? ""}
        anchor={triggerRef}
        onSubmit={(reason) => {
          setAskingReason(false);
          props.onChange({ status: "waiting", waitingReason: reason });
        }}
        onCancel={() => setAskingReason(false)}
      />
    </>
  );
}

/** All four statuses side by side; picking "Esperando" (again) asks for the reason. */
export function WorkStatusPicker(props: WorkStatusControlProps) {
  const waitingRef = useRef<HTMLButtonElement | null>(null);
  const [askingReason, setAskingReason] = useState(false);
  return (
    <>
      <ToggleGroup
        aria-label="Status"
        value={[props.status]}
        disabled={props.disabled}
        onValueChange={(next) => {
          // Re-clicking the pressed item reports an empty value.
          const status = WORK_MODULE_STATUSES.find((s) => s === next[0]) ?? props.status;
          if (status === "waiting") setAskingReason(true);
          else if (status !== props.status) props.onChange({ status, waitingReason: null });
        }}
      >
        {WORK_MODULE_STATUSES.map((status) => (
          <ToggleGroupItem
            key={status}
            value={status}
            {...(status === "waiting" ? { ref: waitingRef } : {})}
          >
            {WORK_STATUS_LABEL[status]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <WorkWaitingReasonPrompt
        open={askingReason}
        initial={props.waitingReason ?? ""}
        anchor={waitingRef}
        onSubmit={(reason) => {
          setAskingReason(false);
          props.onChange({ status: "waiting", waitingReason: reason });
        }}
        onCancel={() => setAskingReason(false)}
      />
    </>
  );
}
