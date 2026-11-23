import {
  CLAUDE_SUBAGENT_MODEL_ALIASES,
  type ClaudeSubagentModelAlias,
  type SubagentModelPolicy,
} from "@t3tools/contracts";
import { useGT } from "gt-react";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { useSearchableSetting } from "./settingsSearch";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

const USAGE_THRESHOLDS = [50, 70, 80, 90, 95] as const;
const MODEL_LABELS: Record<ClaudeSubagentModelAlias, string> = {
  fable: "Fable",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
};
const EMPTY_POLICY: SubagentModelPolicy = { model: null, usagePercent: null, usageModel: null };
const INHERIT = "inherit";
const OFF = "off";

function isAlias(value: string | null): value is ClaudeSubagentModelAlias {
  return value !== null && (CLAUDE_SUBAGENT_MODEL_ALIASES as readonly string[]).includes(value);
}

export function SubagentModelSettings() {
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  const { scope } = useSettingsScope();
  const policy = useScopedSettings((settings) => settings.subagentModel);
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["subagentModel"]);
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const current = policy ?? EMPTY_POLICY;
  const mixedLabel = gt("Mixed", { $context: "values differ across targets" });

  const save = (next: SubagentModelPolicy) =>
    updateSettings({
      subagentModel:
        next.model === null && next.usagePercent === null && next.usageModel === null ? null : next,
    });

  const modelItems = CLAUDE_SUBAGENT_MODEL_ALIASES.map((alias) => (
    <SelectItem key={alias} value={alias}>
      {MODEL_LABELS[alias]}
    </SelectItem>
  ));

  return (
    <>
      <SettingsRow
        serverScoped
        settingKeys={["subagentModel"]}
        mixed={mixed}
        {...searchableSetting("subagent-model")}
        description={
          isProjectScope
            ? gt("Model Claude subagents use in this project when the agent does not pick one.")
            : gt(
                "Model Claude subagents use when the agent does not pick one. Projects can override it.",
              )
        }
        resetAction={
          policy !== null ? (
            <SettingResetButton
              ariaLabel={gt("Reset subagent model to default")}
              onClick={() => updateSettings({ subagentModel: null })}
            />
          ) : null
        }
        control={
          <Select
            value={mixed ? null : (current.model ?? INHERIT)}
            onValueChange={(value) => {
              if (value === INHERIT) save({ ...current, model: null });
              else if (isAlias(value)) save({ ...current, model: value });
            }}
          >
            <SelectTrigger size="sm" aria-label={gt("Subagent model")}>
              <SelectValue>
                {(value: string | null) =>
                  isAlias(value)
                    ? MODEL_LABELS[value]
                    : value === INHERIT
                      ? gt("Claude decides", { $context: "subagent model left to Claude Code" })
                      : mixedLabel
                }
              </SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              <SelectItem value={INHERIT}>
                {gt("Claude decides", { $context: "subagent model left to Claude Code" })}
              </SelectItem>
              {modelItems}
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        serverScoped
        settingKeys={["subagentModel"]}
        mixed={mixed}
        {...searchableSetting("subagent-usage-model")}
        description={gt(
          "Switch subagents to another model once any Claude usage window passes this share, until it resets. Applies from the next turn.",
        )}
        control={
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <Select
              value={
                mixed ? null : current.usagePercent === null ? OFF : String(current.usagePercent)
              }
              onValueChange={(value) => {
                if (value === OFF) save({ ...current, usagePercent: null, usageModel: null });
                else if (value !== null)
                  save({
                    ...current,
                    usagePercent: Number(value),
                    usageModel: current.usageModel ?? "haiku",
                  });
              }}
            >
              <SelectTrigger size="sm" aria-label={gt("Usage threshold for subagents")}>
                <SelectValue>
                  {(value: string | null) =>
                    value === OFF
                      ? gt("Off", { $context: "usage-based subagent model disabled" })
                      : value === null
                        ? mixedLabel
                        : gt("Above {percent}%", { percent: value })
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value={OFF}>
                  {gt("Off", { $context: "usage-based subagent model disabled" })}
                </SelectItem>
                {USAGE_THRESHOLDS.map((percent) => (
                  <SelectItem key={percent} value={String(percent)}>
                    {gt("Above {percent}%", { percent })}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {current.usagePercent !== null && !mixed ? (
              <Select
                value={current.usageModel ?? "haiku"}
                onValueChange={(value) => {
                  if (isAlias(value)) save({ ...current, usageModel: value });
                }}
              >
                <SelectTrigger size="sm" aria-label={gt("Subagent model near the usage limit")}>
                  <SelectValue>
                    {(value: string | null) => (isAlias(value) ? MODEL_LABELS[value] : null)}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  {modelItems}
                </SelectPopup>
              </Select>
            ) : null}
          </div>
        }
      />
    </>
  );
}
