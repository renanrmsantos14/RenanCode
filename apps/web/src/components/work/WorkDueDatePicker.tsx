import { T, useGT } from "gt-react";
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
export const formatShortDate = (value: string) =>
  fromIsoDate(value).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

export function WorkDueDatePicker(props: {
  value: string | null;
  overdue: boolean;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  size?: "sm" | "xs";
}) {
  const gt = useGT();
  const [open, setOpen] = useState(false);
  const selected = props.value === null ? null : fromIsoDate(props.value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={props.disabled}
        render={<Button variant="ghost" size={props.size ?? "sm"} aria-label={gt("Due date")} />}
      >
        <span className={props.overdue ? "text-destructive" : "text-muted-foreground"}>
          {props.value === null ? gt("No due date") : formatShortDate(props.value)}
        </span>
      </PopoverTrigger>
      <PopoverPopup align="start" aria-label={gt("Choose due date")}>
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
            <T>Clear</T>
          </Button>
        )}
      </PopoverPopup>
    </Popover>
  );
}
