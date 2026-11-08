import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { weekStartsOn } from "~/timestampFormat";

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const fromIsoDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
};
const shortLabel = (value: string) =>
  fromIsoDate(value).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

export function WorkDueDatePicker(props: {
  value: string | null;
  overdue: boolean;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = props.value === null ? null : fromIsoDate(props.value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={props.disabled}
        render={<Button variant="ghost" size="sm" aria-label="Prazo" />}
      >
        <span className={props.overdue ? "text-destructive" : "text-muted-foreground"}>
          {props.value === null ? "—" : shortLabel(props.value)}
        </span>
      </PopoverTrigger>
      <PopoverPopup align="start" aria-label="Escolher prazo">
        <Calendar
          mode="single"
          {...(selected === null ? {} : { selected, defaultMonth: selected })}
          {...(weekStartsOn === undefined ? {} : { weekStartsOn })}
          onSelect={(date: Date | undefined) => {
            setOpen(false);
            if (date !== undefined) props.onChange(toIsoDate(date));
          }}
        />
        {props.value === null ? null : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              props.onChange(null);
            }}
          >
            Limpar
          </Button>
        )}
      </PopoverPopup>
    </Popover>
  );
}
