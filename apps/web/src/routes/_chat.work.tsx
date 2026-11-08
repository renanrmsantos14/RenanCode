import { createFileRoute } from "@tanstack/react-router";

import { WorkPage } from "../components/work/WorkPage";

export const Route = createFileRoute("/_chat/work")({
  component: WorkPage,
});
