import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { RemoteTaskRow } from "@t3tools/client-runtime/state/nativeSubagents";
import { formatSubagentDisplayTitle } from "@t3tools/client-runtime/state/subagent-display";
import { useNavigate } from "@tanstack/react-router";

import { useEnvironment } from "../../state/environments";
import { buildThreadRouteParams } from "../../threadRoutes";
import {
  ThreadRelationshipIcon,
  threadRelationshipStatusLabel,
} from "../chat/ThreadRelationshipIcon";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * A task the parent delegated to a linked environment this client is not showing. It opens the
 * thread there when this client is connected to that environment, as its Lineage row does.
 */
export function SidebarRemoteTaskRow(props: {
  readonly task: RemoteTaskRow;
  /** Folder rows start their text past the folder's icon; this row lines up with them. */
  readonly folder: boolean;
}) {
  const navigate = useNavigate();
  const { remoteChild, status } = props.task;
  const environment = useEnvironment(remoteChild.environmentId);
  const title = formatSubagentDisplayTitle(props.task.title ?? "Subagent");
  return (
    <li className="list-none">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-disabled={environment === null || undefined}
              data-testid="sidebar-row-remote-task"
              className={cn(
                "group/sidebar-row flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md text-left text-sidebar-foreground outline-none select-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-disabled:cursor-default",
                props.folder ? "ps-9 pe-2.5" : "px-2.5",
              )}
              onClick={() => {
                if (environment === null) return;
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: buildThreadRouteParams(
                    scopeThreadRef(remoteChild.environmentId, remoteChild.threadId),
                  ),
                });
              }}
            />
          }
        >
          <ThreadRelationshipIcon status={status} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          <span
            className={`shrink-0 text-2xs ${status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
          >
            on {remoteChild.label} · {threadRelationshipStatusLabel(status)}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="right">
          {environment === null
            ? `Runs on ${remoteChild.label}. Connect to it to open the thread there.`
            : `Open on ${remoteChild.label}`}
        </TooltipPopup>
      </Tooltip>
    </li>
  );
}
