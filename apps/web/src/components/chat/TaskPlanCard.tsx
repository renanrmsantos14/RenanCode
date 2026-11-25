import type { OrchestrationV2PlanStep } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { CheckIcon, CircleDashedIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Spinner } from "../ui/spinner";

function TaskPlanStepIcon({ status }: { status: OrchestrationV2PlanStep["status"] }) {
  // Keyed by status so a step that changes state fades its new icon in.
  return (
    <span
      key={status}
      aria-hidden="true"
      className="flex size-4 shrink-0 items-center justify-center motion-safe:animate-step-in"
    >
      {status === "running" ? (
        <Spinner size="md" aria-hidden="true" />
      ) : status === "completed" ? (
        <span className="flex size-4 items-center justify-center rounded-full bg-muted-foreground text-background">
          <CheckIcon className="size-2.5" strokeWidth={3.5} />
        </span>
      ) : (
        <CircleDashedIcon className="size-4 text-muted-foreground" />
      )}
    </span>
  );
}

/** The turn's task plan, kept below its last message and updated in place. */
export function TaskPlanCard({ steps }: { steps: ReadonlyArray<OrchestrationV2PlanStep> }) {
  const gt = useGT();
  const total = steps.length;
  const stateLabel = (status: OrchestrationV2PlanStep["status"]) =>
    status === "running" ? gt("in progress") : status === "completed" ? gt("done") : gt("pending");

  return (
    <ol
      role="list"
      aria-label={gt("Task plan")}
      className="flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3"
    >
      {steps.map((step, index) => (
        <li
          key={step.id}
          aria-label={gt("Step {step} of {total}: {text}, {state}", {
            step: index + 1,
            total,
            text: step.text,
            state: stateLabel(step.status),
          })}
          aria-live={step.status === "running" ? "polite" : undefined}
          className="flex min-w-0 items-start gap-2.5 text-sm leading-5"
        >
          <span className="flex h-5 items-center">
            <TaskPlanStepIcon status={step.status} />
          </span>
          <span
            className={cn(
              "min-w-0 break-words",
              step.status === "running" ? "text-foreground" : "text-muted-foreground",
              step.status === "completed" && "line-through decoration-muted-foreground/50",
            )}
          >
            {step.text}
          </span>
        </li>
      ))}
    </ol>
  );
}
