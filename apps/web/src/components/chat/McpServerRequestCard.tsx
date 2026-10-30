import {
  mcpServerRequestDisplay,
  type McpServerRequestItem,
} from "@t3tools/client-runtime/mcp-server-request";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import { CheckIcon, LockIcon, MinusIcon, PlugIcon } from "lucide-react";
import { useState } from "react";

import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { Button } from "../ui/button";
import { WorkLogRow } from "./WorkLog";

export function McpServerRequestCard(props: {
  readonly environmentId: EnvironmentId;
  readonly item: McpServerRequestItem;
  readonly visibility: OrchestrationV2ProjectedTurnItem["visibility"];
}) {
  const { item } = props;
  const answer = useOrchestrationCommand(threadEnvironment.answerMcpServerRequest);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const display = mcpServerRequestDisplay(item, props.visibility);
  if (display.kind !== "pending") {
    const Icon =
      display.kind === "pending-elsewhere" ? LockIcon : display.enabled ? CheckIcon : MinusIcon;
    return (
      <WorkLogRow
        data-v2-item-type={item.type}
        icon={<Icon className="size-3.5 text-icon-muted" aria-hidden />}
        label={
          <>
            {item.server} · {display.label}
          </>
        }
      />
    );
  }

  const send = async (enable: boolean) => {
    setSubmitting(true);
    setFailed(false);
    const result = await answer({
      environmentId: props.environmentId,
      input: { threadId: item.threadId, turnItemId: item.id, enable },
    }).finally(() => setSubmitting(false));
    setFailed(result._tag === "Failure" && !isAtomCommandInterrupted(result));
  };

  return (
    <div
      data-v2-item-type={item.type}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-card p-4"
    >
      <div className="flex min-w-0 items-start gap-2">
        <PlugIcon className="mt-0.5 size-4 shrink-0 text-icon-muted" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Turn on {item.server}?</p>
          {item.reason.trim() ? (
            <p className="text-sm text-muted-foreground">{item.reason}</p>
          ) : null}
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-xs text-destructive">
          Could not send your answer. Try again.
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={submitting} onClick={() => void send(false)}>
          Not now
        </Button>
        <Button disabled={submitting} onClick={() => void send(true)}>
          Turn on
        </Button>
      </div>
    </div>
  );
}
