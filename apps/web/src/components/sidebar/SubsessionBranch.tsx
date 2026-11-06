import type { ReactNode } from "react";

import type { SidebarTreeLineColor } from "@t3tools/contracts/settings";

import { useClientSettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";

const LINE_COLOR_CLASS: Record<SidebarTreeLineColor, string> = {
  border: "border-border",
  muted: "border-muted-foreground/60",
  primary: "border-primary",
  info: "border-info",
  success: "border-success",
  warning: "border-warning",
};
const DEFAULT_INDENT_PX = 8;
const MIN_ELBOW_PX = 4;

/**
 * One subsession under its parent row, drawn as a tree branch: a rounded elbow into the row and,
 * unless it is the last sibling, the trunk carrying on past it and its own subsessions. Folder
 * rows keep their titles well right of the edge, so their trunk sits further in than slim rows',
 * whose favicon starts near it. The elbow meets the first line of a one- or two-line row.
 */
export function SubsessionBranch(props: {
  readonly last: boolean;
  readonly folder: boolean;
  readonly indent: boolean;
  readonly children: ReactNode;
}) {
  const lineColor = LINE_COLOR_CLASS[useClientSettings((s) => s.sidebarTreeLineColor)];
  const lineWidth = useClientSettings((s) => s.sidebarTreeLineWidth);
  const indentPx = useClientSettings((s) => s.sidebarTreeIndent);
  const trunkInset = props.folder ? "start-6" : "start-2.5";
  // The elbow grows with the indent so it still reaches the row.
  const elbowWidth = Math.max(MIN_ELBOW_PX, (props.folder ? 12 : 6) + indentPx - DEFAULT_INDENT_PX);
  return (
    <li className="relative list-none">
      {props.last ? null : (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 -bottom-px border-solid",
            lineColor,
            trunkInset,
          )}
          style={{ borderInlineStartWidth: lineWidth }}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 h-4.5 rounded-es-md border-solid",
          lineColor,
          trunkInset,
        )}
        style={{
          width: elbowWidth,
          borderInlineStartWidth: lineWidth,
          borderBlockEndWidth: lineWidth,
        }}
      />
      <ul
        className="flex flex-col gap-px"
        style={props.indent ? { paddingInlineStart: indentPx } : undefined}
      >
        {props.children}
      </ul>
    </li>
  );
}
