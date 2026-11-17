import type {
  ProviderUsageLimitsUpdate,
  ServerProvider,
  ServerProviderUsageLimits,
  ServerSettingsError,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type { ProviderMaintenanceCapabilities } from "./maintenance.ts";

/** authLabel names the plan, for drivers whose usage report carries it. */
export type ProviderUsageLimitsReport = ProviderUsageLimitsUpdate & {
  readonly checkedAt: string;
  readonly authLabel?: string;
  /** A full reading replaces sparse windows and clears a previous probe failure. */
  readonly complete?: boolean;
};

export interface ManagedServerProvider {
  /** Cached; pass { fresh: true } before executing updates. */
  readonly resolveMaintenance: (options?: {
    readonly fresh?: boolean;
  }) => Effect.Effect<ProviderMaintenanceCapabilities>;
  readonly getSnapshot: Effect.Effect<ServerProvider>;
  /** True while getSnapshot still returns the placeholder from before the first completed check. */
  readonly isAwaitingFirstCheck?: Effect.Effect<boolean>;
  readonly refresh: Effect.Effect<ServerProvider>;
  readonly refreshUsage?: Effect.Effect<void, ServerSettingsError>;
  readonly streamChanges: Stream.Stream<ServerProvider>;
  /** Merge windows by ID and set any authLabel; an update with no window leaves the snapshot untouched. */
  readonly applyUsageLimits: (update: ProviderUsageLimitsReport) => Effect.Effect<void>;
  /**
   * A full out-of-band usage poll. Success replaces the windows and advances `checkedAt`;
   * failure keeps both and records why. Absent where the provider has no such poll.
   */
  readonly recordUsageReading?: (
    reading:
      | { readonly _tag: "ok"; readonly limits: ServerProviderUsageLimits }
      | {
          readonly _tag: "failed";
          readonly at: string;
          readonly reason: NonNullable<ServerProviderUsageLimits["lastError"]>["reason"];
          readonly retryAt?: string;
        },
  ) => Effect.Effect<void>;
}
