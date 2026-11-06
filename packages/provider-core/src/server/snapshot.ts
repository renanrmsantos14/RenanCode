import type {
  ProviderUsageLimitsUpdate,
  ServerProvider,
  ServerProviderUsageLimits,
  ServerSettingsError,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type { ProviderMaintenanceCapabilities } from "./maintenance.ts";

export interface ManagedServerProvider {
  /** Cached; pass { fresh: true } before executing updates. */
  readonly resolveMaintenance: (options?: {
    readonly fresh?: boolean;
  }) => Effect.Effect<ProviderMaintenanceCapabilities>;
  readonly getSnapshot: Effect.Effect<ServerProvider>;
  readonly refresh: Effect.Effect<ServerProvider>;
  readonly refreshUsage?: Effect.Effect<void, ServerSettingsError>;
  readonly streamChanges: Stream.Stream<ServerProvider>;
  /** Merge windows by ID; updates with no usable window leave the snapshot untouched. */
  readonly applyUsageLimits: (
    update: ProviderUsageLimitsUpdate & { readonly checkedAt: string },
  ) => Effect.Effect<void>;
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
        },
  ) => Effect.Effect<void>;
}
