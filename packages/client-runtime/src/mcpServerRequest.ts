import {
  mcpServerIsOn,
  type OrchestrationV2ProviderMcpServer,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";

export type McpServerRequestItem = Extract<
  OrchestrationV2TurnItem,
  { readonly type: "mcp_server_request" }
>;

export type McpServerRequestDisplay =
  | { readonly kind: "pending" }
  | { readonly kind: "pending-elsewhere"; readonly label: string }
  | { readonly kind: "answered"; readonly enabled: boolean; readonly label: string };

const OUTCOME_LABELS = {
  enabled: "Turned on",
  declined: "Kept off",
  cancelled: "Closed",
} as const;

/**
 * `visibility` is the projected row's: a request inherited from another
 * thread (a fork) can only be answered where it was asked.
 */
export function mcpServerRequestDisplay(
  item: Pick<McpServerRequestItem, "mcpServerStatus">,
  visibility: "local" | "inherited" | "synthetic",
): McpServerRequestDisplay {
  if (item.mcpServerStatus !== "pending") {
    return {
      kind: "answered",
      enabled: item.mcpServerStatus === "enabled",
      label: OUTCOME_LABELS[item.mcpServerStatus],
    };
  }
  return visibility === "local"
    ? { kind: "pending" }
    : { kind: "pending-elsewhere", label: "Waiting for an answer in the original thread" };
}

const STATUS_NOTES: Partial<Record<OrchestrationV2ProviderMcpServer["status"], string>> = {
  failed: "Failed",
  "needs-auth": "Needs sign-in",
  pending: "Connecting",
};

/** The hint under a server's switch: why it is locked, pending, or unhealthy. */
export function mcpServerNote(
  server: OrchestrationV2ProviderMcpServer,
  on: boolean,
): string | undefined {
  if (server.alwaysOn) return "Always on in settings";
  if (on !== (server.status !== "disabled")) return "Applies on next message";
  return on ? STATUS_NOTES[server.status] : undefined;
}

/**
 * Pinned, on, and always-on servers stay in view; the rest fold away.
 * With nothing pinned yet every server stays in view so the user can find one to pin.
 */
export function splitMcpServers(
  servers: ReadonlyArray<OrchestrationV2ProviderMcpServer>,
  enabled: ReadonlyArray<string>,
  pinned: ReadonlyArray<string>,
) {
  if (pinned.length === 0) return { shown: servers, more: [] };
  const inView = (server: OrchestrationV2ProviderMcpServer) =>
    pinned.includes(server.name) || mcpServerIsOn(server, enabled);
  return { shown: servers.filter(inView), more: servers.filter((server) => !inView(server)) };
}
