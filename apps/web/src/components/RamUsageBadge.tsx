import { usePrimaryEnvironment } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";
import { useResourceTelemetry } from "../lib/resourceTelemetryState";

const GIB = 1_024 ** 3;

/** RSS of the whole T3 process tree (server, Electron, providers and their children) vs host RAM. */
export function RamUsageBadge() {
  const environmentId = usePrimaryEnvironment()?.environmentId ?? null;
  const telemetry = useResourceTelemetry(environmentId);
  const host = useEnvironmentQuery(
    environmentId === null ? null : serverEnvironment.hostResources({ environmentId, input: {} }),
  );
  const usedBytes = telemetry.data?.groups.allT3.currentRssBytes;
  const totalBytes = host.data?.totalMemoryBytes;
  if (usedBytes === undefined) return null;

  const percent = totalBytes ? ` · ${Math.round((usedBytes / totalBytes) * 100)}%` : "";
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-2 bottom-1.5 z-50 select-none font-mono text-3xs text-muted-foreground/60 tabular-nums"
    >
      RAM {(usedBytes / GIB).toFixed(1)}GB{percent}
    </div>
  );
}
