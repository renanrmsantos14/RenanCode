import type { ProviderDriverKind } from "@t3tools/contracts";
import { resolveModelShortName } from "@t3tools/client-runtime/provider-clients";

export type ModelEsque = {
  slug: string;
  name: string;
  shortName?: string | undefined;
  subProvider?: string | undefined;
  aliases?: ReadonlyArray<string> | undefined;
  isDefault?: boolean | undefined;
  badge?: "new" | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLeadingQualifier(value: string, qualifier: string | null | undefined): string {
  const trimmedQualifier = qualifier?.trim();
  if (!trimmedQualifier) {
    return value;
  }

  const pattern = new RegExp(`^${escapeRegExp(trimmedQualifier)}(?:\\s*[.:/-]\\s*|\\s+)`, "iu");
  return value.replace(pattern, "").trim() || value;
}

export function getDisplayModelName(
  model: ModelEsque,
  options?: { preferShortName?: boolean },
): string {
  const name = options?.preferShortName && model.shortName ? model.shortName : model.name;
  return stripLeadingQualifier(name, model.subProvider);
}

export function getTriggerDisplayModelName(
  model: ModelEsque,
  driverKind: ProviderDriverKind | null | undefined,
): string {
  const shortName = resolveModelShortName(model, driverKind);
  return getDisplayModelName({ ...model, shortName }, { preferShortName: true });
}

const CLAUDE_TIERS = ["fable", "opus", "sonnet", "haiku"] as const;

function claudeTierOf(name: string): number {
  const index = CLAUDE_TIERS.findIndex((tier) => name.toLowerCase().includes(tier));
  return index === -1 ? CLAUDE_TIERS.length : index;
}

/** Claude picker order: strongest tier first (Fable, Opus, Sonnet, Haiku); stable within a tier. */
export function sortClaudeModelsByTier<T extends { name: string }>(models: ReadonlyArray<T>): T[] {
  return models.toSorted((a, b) => claudeTierOf(a.name) - claudeTierOf(b.name));
}

/** "Claude Sonnet 5.5" -> "Sonnet": the picker only lists the latest version of each tier. */
export function getClaudeTierName(name: string): string {
  const tier = CLAUDE_TIERS[claudeTierOf(name)];
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : name;
}
