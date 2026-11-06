import { createFileRoute } from "@tanstack/react-router";
import { SidebarSettingsPanel } from "../components/settings/SidebarSettingsPanel";

export const Route = createFileRoute("/_chat/settings/sidebar")({
  component: SidebarSettingsPanel,
});
