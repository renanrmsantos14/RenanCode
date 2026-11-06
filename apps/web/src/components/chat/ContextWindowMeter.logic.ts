import type { ModelSelection, ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import {
  COLD_CACHE_WARNING_MIN_TOKENS,
  fallbackPromptCacheTtlMs,
  supportsPromptCacheFeatures,
} from "@t3tools/shared/promptCache";
import {
  resolveSelectableProviderInstanceEntry,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { getDisplayModelName, type ModelEsque } from "./providerIconUtils";

export function providerSupportsManualCompaction(
  provider: ProviderInstanceEntry | null | undefined,
): boolean {
  return provider?.snapshot.slashCommands.some((command) => command.name === "compact") ?? false;
}

export function hasAvailableCompactionProvider(input: {
  readonly providers: ReadonlyArray<ProviderInstanceEntry>;
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId | null;
  readonly lockedInstanceId: ProviderInstanceId | null;
}): boolean {
  const driverProviders = input.providers.filter(
    (provider) => provider.driverKind === input.driverKind,
  );
  const lockedContinuationGroupKey = input.lockedInstanceId
    ? driverProviders.find((provider) => provider.instanceId === input.lockedInstanceId)
        ?.continuationGroupKey
    : undefined;
  const compatibleProviders = lockedContinuationGroupKey
    ? driverProviders.filter(
        (provider) => provider.continuationGroupKey === lockedContinuationGroupKey,
      )
    : driverProviders;

  return providerSupportsManualCompaction(
    resolveSelectableProviderInstanceEntry(compatibleProviders, input.instanceId ?? undefined),
  );
}

/**
 * The pre-send warning for a large thread whose prompt cache expired, or null when the cache is
 * warm, the thread is small, the provider reports no cache data, or it has no cache to lose.
 */
export function coldCacheWarning(input: {
  readonly driver: string | null | undefined;
  readonly usage:
    | {
        readonly usedTokens: number;
        readonly cachedInputTokens?: number | undefined;
        readonly promptCacheTtlMs?: number | undefined;
        readonly promptCacheExpiresAt?: string | undefined;
        readonly updatedAt: string;
      }
    | null
    | undefined;
  readonly now: string;
}): { readonly usedTokens: number } | null {
  const { driver, usage } = input;
  if (!driver || !usage || !supportsPromptCacheFeatures(driver)) return null;
  if (usage.usedTokens < COLD_CACHE_WARNING_MIN_TOKENS) return null;
  if (
    usage.promptCacheExpiresAt === undefined &&
    usage.promptCacheTtlMs === undefined &&
    usage.cachedInputTokens === undefined
  ) {
    return null;
  }
  const expiresAt =
    usage.promptCacheExpiresAt === undefined
      ? Date.parse(usage.updatedAt) + (usage.promptCacheTtlMs ?? fallbackPromptCacheTtlMs(driver))
      : Date.parse(usage.promptCacheExpiresAt);
  const now = Date.parse(input.now);
  return Number.isFinite(expiresAt) && Number.isFinite(now) && now >= expiresAt
    ? { usedTokens: usage.usedTokens }
    : null;
}

export function resolveContextWindowModelDisplayName(
  selection: ModelSelection | null | undefined,
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>,
): string | null {
  if (!selection) {
    return null;
  }

  const selectedModel = modelOptionsByInstance
    .get(selection.instanceId)
    ?.find((model) => model.slug === selection.model);

  return selectedModel ? getDisplayModelName(selectedModel) : selection.model;
}

export function formatContextWindowCompactionMessage(
  modelDisplayName: string | null | undefined,
  autoCompactThreshold?: number | null,
): string {
  if (typeof autoCompactThreshold === "number" && autoCompactThreshold > 0) {
    return `Compacts automatically at about ${autoCompactThreshold.toLocaleString("en-US")} tokens.`;
  }
  return modelDisplayName
    ? `Context for ${modelDisplayName} compacts automatically when needed.`
    : "Context compacts automatically when needed.";
}

export function shouldReserveContextWindowMeter(input: {
  readonly meterEnabled: boolean;
  readonly detailLoading: boolean;
  readonly threadStarted: boolean;
  readonly providerReportsContextWindow: boolean | null;
}): boolean {
  return (
    input.meterEnabled &&
    input.detailLoading &&
    input.threadStarted &&
    input.providerReportsContextWindow !== false
  );
}

export function formatContextWindowCost(cost: {
  readonly amount: number;
  readonly currency: string;
}): string {
  const fractionDigits = Math.abs(cost.amount) > 0 && Math.abs(cost.amount) < 0.01 ? 4 : 2;
  return `${cost.currency} ${cost.amount.toFixed(fractionDigits)}`;
}
