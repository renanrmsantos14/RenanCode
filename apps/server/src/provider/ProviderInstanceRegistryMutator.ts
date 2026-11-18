/**
 * Reconcile retires removed/replaced instances before creating replacements, so at most one instance
 * per id serves new turns. A removed instance closes at once; a replaced one stays open only until the
 * turns already running on it end.
 */
import type {
  ProviderInstanceConfigMap,
  ProviderInstanceId,
  SecretReference,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

export interface ProviderInstanceRegistryMutatorShape {
  readonly reconcile: (configMap: ProviderInstanceConfigMap) => Effect.Effect<void>;
  /** Re-reads the secrets of every instance, or one, and rebuilds those whose secrets changed. */
  readonly reloadSecrets: (instanceId?: ProviderInstanceId) => Effect.Effect<void>;
  /** Rebuilds these live instances from their current configuration and the host environment. */
  readonly rebuild: (instanceIds: ReadonlyArray<ProviderInstanceId>) => Effect.Effect<void>;
  /**
   * Rebuilds the instances that read `reference` with `value`, keeping the other secrets a live
   * instance holds, and returns them. A parked instance reads its other secrets from the resolver.
   */
  readonly applySecret: (
    reference: SecretReference,
    value: string,
  ) => Effect.Effect<ReadonlyArray<ProviderInstanceId>>;
}

export class ProviderInstanceRegistryMutator extends Context.Service<
  ProviderInstanceRegistryMutator,
  ProviderInstanceRegistryMutatorShape
>()("t3/provider/ProviderInstanceRegistryMutator") {}
