import type { ComponentProps } from "react";
import { useState } from "react";

import { Input } from "~/components/ui/input";
import { Popover, PopoverPopup } from "~/components/ui/popover";

export function WorkWaitingReasonPrompt(props: {
  open: boolean;
  initial: string;
  anchor: ComponentProps<typeof PopoverPopup>["anchor"];
  onSubmit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState(props.initial);
  return (
    <Popover
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
    >
      <PopoverPopup anchor={props.anchor} align="start" padding="compact" width="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = reason.trim();
            if (trimmed === "") return;
            props.onSubmit(trimmed);
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
  );
}
