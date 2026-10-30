import { createFileRoute } from "@tanstack/react-router";

import { HistoryImportSettings } from "../components/settings/HistoryImportSettings";

export const Route = createFileRoute("/_chat/settings/import")({
  component: HistoryImportSettings,
});
