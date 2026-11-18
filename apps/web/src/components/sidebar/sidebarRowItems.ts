import type { ClientSettings } from "@t3tools/contracts";
import { msg } from "gt-react";

// Ids are stored in client settings, so never rename one.
export const SIDEBAR_ROW_ITEMS = [
  { id: "pullRequestStatus", label: msg("Pull request status"), twoLineOnly: false },
  { id: "branch", label: msg("Branch", { $context: "sidebar row detail" }), twoLineOnly: true },
  { id: "pullRequest", label: msg("Pull request number"), twoLineOnly: true },
  { id: "diff", label: msg("Changed lines"), twoLineOnly: true },
  { id: "agent", label: msg("Agent", { $context: "sidebar row detail" }), twoLineOnly: false },
  { id: "machine", label: msg("Remote machine"), twoLineOnly: false },
] as const;

export type SidebarRowItem = (typeof SIDEBAR_ROW_ITEMS)[number];
export type SidebarRowItemId = SidebarRowItem["id"];
export type SidebarRowVisibility = Readonly<Record<SidebarRowItemId, boolean>>;

type SidebarRowItemSettings = Pick<ClientSettings, "sidebarRowItems">;

/** Every item shows unless turned off. */
export function resolveSidebarRowVisibility(
  settings: SidebarRowItemSettings,
): SidebarRowVisibility {
  return Object.fromEntries(
    SIDEBAR_ROW_ITEMS.map((item) => [item.id, settings.sidebarRowItems[item.id] ?? true]),
  ) as Record<SidebarRowItemId, boolean>;
}

/** Stores only items turned off, so a later item reaches everyone shown. */
export function setSidebarRowItem(
  settings: SidebarRowItemSettings,
  id: SidebarRowItemId,
  visible: boolean,
): ClientSettings["sidebarRowItems"] {
  const { [id]: _previous, ...rest } = settings.sidebarRowItems;
  return visible ? rest : { ...rest, [id]: false };
}
