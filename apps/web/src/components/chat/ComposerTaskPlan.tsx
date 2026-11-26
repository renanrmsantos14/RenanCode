import type { OrchestrationV2PlanStep } from "@t3tools/contracts";
import { useGT } from "gt-react";
import { CheckIcon, CircleDashedIcon, CircleDotIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { Spinner } from "../ui/spinner";
import { ComposerBanner } from "./ComposerBanner";

type StepStatus = OrchestrationV2PlanStep["status"];

function StepGlyph({ status, live }: { status: StepStatus; live: boolean }) {
  if (status === "completed") {
    return (
      <span className="flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <CheckIcon className="size-2.5" strokeWidth={3.5} />
      </span>
    );
  }
  if (status === "pending") return <CircleDashedIcon className="size-3.5" />;
  // A step left running after the turn ends must not keep spinning.
  return (
    <span className="flex text-primary">
      {live ? <Spinner size="sm" /> : <CircleDotIcon className="size-3.5" />}
    </span>
  );
}

function StepIcon(props: { status: StepStatus; live: boolean }) {
  // Keyed by status so a step that changes state fades its new icon in.
  return (
    <span key={props.status} className="flex motion-safe:animate-step-in">
      <StepGlyph {...props} />
    </span>
  );
}

/** The thread's task plan, pinned above the composer: the current step, expandable to all. */
export function ComposerTaskPlan({
  steps,
  live,
}: {
  steps: ReadonlyArray<OrchestrationV2PlanStep>;
  live: boolean;
}) {
  const gt = useGT();
  const [expanded, setExpanded] = useState(false);
  const total = steps.length;
  const done = steps.filter((step) => step.status === "completed").length;
  const current =
    steps.find((step) => step.status === "running") ??
    steps.find((step) => step.status === "pending");
  const stateLabel = (status: StepStatus) =>
    status === "running" ? gt("in progress") : status === "completed" ? gt("done") : gt("pending");

  return (
    <ComposerBanner.Attachment>
      <ComposerBanner.Root data-composer-task-plan="true">
        <ComposerBanner.Row
          render={<button type="button" />}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <ComposerBanner.Icon className="[&>svg]:size-3.5">
            <StepIcon status={current?.status ?? "completed"} live={live} />
          </ComposerBanner.Icon>
          <ComposerBanner.Content aria-live="polite">
            <span className="truncate text-foreground">{current?.text ?? gt("Plan complete")}</span>
          </ComposerBanner.Content>
          <ComposerBanner.Actions className="gap-2">
            <span className="text-muted-foreground tabular-nums">
              {done}/{total}
            </span>
            <span aria-hidden className="flex gap-0.5">
              {steps.map((step) => (
                <span
                  key={step.id}
                  className={cn(
                    "h-1 w-2.5 rounded-full bg-border transition-colors duration-200 motion-reduce:transition-none",
                    step.status === "completed" && "bg-primary",
                    step.status === "running" && "bg-primary/45",
                  )}
                />
              ))}
            </span>
            <ComposerBanner.ToggleIcon expanded={expanded} />
          </ComposerBanner.Actions>
        </ComposerBanner.Row>
        {expanded ? (
          <ComposerBanner.Scroll>
            <ComposerBanner.Children render={<ol role="list" />} aria-label={gt("Task plan")}>
              {steps.map((step, index) => (
                <ComposerBanner.Row
                  render={<li />}
                  key={step.id}
                  aria-label={gt("Step {step} of {total}: {text}, {state}", {
                    step: index + 1,
                    total,
                    text: step.text,
                    state: stateLabel(step.status),
                  })}
                >
                  <ComposerBanner.Icon className="[&>svg]:size-3.5">
                    <StepIcon status={step.status} live={live} />
                  </ComposerBanner.Icon>
                  <ComposerBanner.Content
                    className={cn(
                      "py-0.5",
                      step.status === "running" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span className="break-words">{step.text}</span>
                  </ComposerBanner.Content>
                </ComposerBanner.Row>
              ))}
            </ComposerBanner.Children>
          </ComposerBanner.Scroll>
        ) : null}
      </ComposerBanner.Root>
    </ComposerBanner.Attachment>
  );
}
