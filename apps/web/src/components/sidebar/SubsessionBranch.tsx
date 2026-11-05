import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

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
  const trunkInset = props.folder ? "start-6" : "start-2.5";
  return (
    <li className="relative list-none">
      {props.last ? null : (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 -bottom-px border-s-2 border-border",
            trunkInset,
          )}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 h-4.5 rounded-es-md border-s-2 border-b-2 border-border",
          trunkInset,
          props.folder ? "w-3" : "w-1.5",
        )}
      />
      <ul className={cn("flex flex-col gap-px", props.indent && "ps-2")}>{props.children}</ul>
    </li>
  );
}
