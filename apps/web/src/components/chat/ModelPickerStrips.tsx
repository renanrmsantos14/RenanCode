import type { ProviderInstanceId } from "@t3tools/contracts";
import { SearchIcon, StarIcon } from "lucide-react";
import { memo, type ReactNode, useState } from "react";

import { useEnvironmentModelPreferences } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import { providerModelKey } from "../../modelOrdering";
import {
  isProviderInstancePickerVisible,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import {
  resolveModelPickerSelectedModel,
  shouldIncludeModelPickerOption,
} from "./ModelPickerContent";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { getDisplayModelName, type ModelEsque } from "./providerIconUtils";

type StripModel = {
  readonly instanceId: ProviderInstanceId;
  readonly slug: string;
  readonly entry: ProviderInstanceEntry;
  readonly label: string;
  readonly disabledReason: string | null;
};

const FAVORITES_TAB = "favorites";
type Tab = ProviderInstanceId | typeof FAVORITES_TAB;

// A brand mark can match the selected segment's solid fill, so the checked one is flattened to the text color.
function EntryIcon(props: { entry: ProviderInstanceEntry; flatten?: boolean }) {
  const { entry } = props;
  return (
    <ProviderInstanceIcon
      driverKind={entry.driverKind}
      displayName={entry.displayName}
      accentColor={entry.accentColor}
      acpRegistryAgentId={entry.acpRegistryAgentId}
      acpRegistryIconUrl={entry.acpRegistryIconUrl}
      className="size-3.5"
      iconClassName={cn("size-3.5", props.flatten && "brightness-0 invert dark:invert-0")}
    />
  );
}

const SEGMENT =
  "flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-64 data-checked:bg-foreground data-checked:text-background data-checked:font-bold";

/**
 * The composer's default picker body: provider, then model, then the effort strip passed as
 * `effort`. Providers with long lists scroll sideways; "Buscar modelo" opens the full list.
 */
export const ModelPickerStrips = memo(function ModelPickerStrips(props: {
  environmentId: Parameters<typeof useEnvironmentModelPreferences>[0];
  activeInstanceId: ProviderInstanceId;
  model: string;
  title: string;
  summary: string | null;
  shortcutLabel: string | null;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  lockedMatches: (entry: ProviderInstanceEntry) => boolean;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  getModelDisabledReason: (instanceId: ProviderInstanceId, model: string) => string | null;
  onSelect: (instanceId: ProviderInstanceId, model: string) => void;
  onSearch: () => void;
  effort: ReactNode;
}) {
  const { favorites } = useEnvironmentModelPreferences(props.environmentId);
  const favoriteKeys = new Set(
    favorites.map((favorite) => providerModelKey(favorite.provider, favorite.model)),
  );
  const entries = props.instanceEntries.filter(isProviderInstancePickerVisible);
  const activeEntry = entries.find((entry) => entry.instanceId === props.activeInstanceId);
  const activeSlug =
    resolveModelPickerSelectedModel({
      driverKind: activeEntry?.driverKind,
      model: props.model,
      options: props.modelOptionsByInstance.get(props.activeInstanceId) ?? [],
    })?.slug ?? props.model;

  const modelsOf = (entry: ProviderInstanceEntry): ReadonlyArray<StripModel> =>
    (props.modelOptionsByInstance.get(entry.instanceId) ?? [])
      .filter(
        (option) =>
          !option.isLegacy &&
          shouldIncludeModelPickerOption({
            entry,
            option,
            activeInstanceId: props.activeInstanceId,
            activeModel: activeSlug,
          }),
      )
      .map((option) => ({
        instanceId: entry.instanceId,
        slug: option.slug,
        entry,
        label: getDisplayModelName(option, { preferShortName: true }),
        disabledReason: props.getModelDisabledReason(entry.instanceId, option.slug),
      }));

  const favoriteModels = entries
    .filter(props.lockedMatches)
    .flatMap(modelsOf)
    .filter((model) => favoriteKeys.has(providerModelKey(model.instanceId, model.slug)));
  const tabs: ReadonlyArray<{ id: Tab; label: string; entry: ProviderInstanceEntry | null }> = [
    ...(favoriteModels.length > 0
      ? [{ id: FAVORITES_TAB as Tab, label: "Favoritos", entry: null }]
      : []),
    ...entries.map((entry) => ({ id: entry.instanceId as Tab, label: entry.displayName, entry })),
  ];
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab = tabs.some((candidate) => candidate.id === picked) ? picked! : props.activeInstanceId;
  const tabEntry = entries.find((entry) => entry.instanceId === tab);
  const models = tab === FAVORITES_TAB ? favoriteModels : tabEntry ? modelsOf(tabEntry) : [];
  const tabLocked = tabEntry ? !props.lockedMatches(tabEntry) : false;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="min-w-0 truncate text-lg font-bold tracking-tight">{props.title}</h2>
        {props.summary ? (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {props.summary}
          </span>
        ) : null}
        {props.shortcutLabel ? (
          <kbd className="ms-auto shrink-0 text-xs text-muted-foreground">
            {props.shortcutLabel}
          </kbd>
        ) : null}
      </div>
      <div
        role="tablist"
        aria-label="Provedor"
        className="flex gap-4 overflow-x-auto [scrollbar-width:none] border-b border-border/70 px-1"
      >
        {tabs.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={candidate.id === tab}
            className={cn(
              "-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent pb-2 text-sm font-semibold whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground",
              candidate.id === tab && "border-foreground font-bold text-foreground",
            )}
            onClick={() => setPicked(candidate.id)}
          >
            {candidate.entry ? (
              <EntryIcon entry={candidate.entry} />
            ) : (
              <StarIcon aria-hidden="true" className="size-3.5" />
            )}
            {candidate.label}
          </button>
        ))}
      </div>
      <div
        role="radiogroup"
        aria-label="Modelo"
        className="flex gap-0.5 overflow-x-auto [scrollbar-width:none] rounded-xl border border-border/70 bg-accent/50 p-0.5"
      >
        {models.length === 0 ? (
          <span className="px-3 py-1.5 text-sm text-muted-foreground">
            Nenhum modelo disponível
          </span>
        ) : (
          models.map((model) => {
            const checked =
              model.instanceId === props.activeInstanceId && model.slug === activeSlug;
            return (
              <button
                key={`${model.instanceId}:${model.slug}`}
                type="button"
                role="radio"
                aria-checked={checked}
                data-checked={checked || undefined}
                disabled={tabLocked || model.disabledReason !== null}
                className={SEGMENT}
                onClick={() => props.onSelect(model.instanceId, model.slug)}
              >
                {tab === FAVORITES_TAB ? <EntryIcon entry={model.entry} flatten={checked} /> : null}
                {model.label}
              </button>
            );
          })
        )}
      </div>
      {props.effort}
      <button
        type="button"
        className="flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-muted-foreground outline-none hover:bg-foreground/[0.09] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={props.onSearch}
      >
        <SearchIcon aria-hidden="true" className="size-3.5" />
        Buscar modelo
      </button>
    </div>
  );
});
