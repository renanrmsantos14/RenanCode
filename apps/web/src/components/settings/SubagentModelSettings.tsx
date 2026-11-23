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

const DAILY_BUDGETS = [5, 10, 15, 20] as const;
const MODEL_LABELS: Record<ClaudeSubagentModelAlias, string> = {
  fable: "Fable",
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
};
const EMPTY_POLICY: SubagentModelPolicy = {
  model: null,
  dailyBudgetPercent: null,
  usageModel: null,
};
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
        next.model === null && next.dailyBudgetPercent === null && next.usageModel === null
          ? null
          : next,
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
          "Each weekday after the weekly reset adds 20% to the goal, reaching 100% by the fifth. Subagents switch to another model once this much of today's 20% is used (15% on Wednesday switches at 55%). Applies from the next turn.",
        )}
        control={
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <Select
              value={
                mixed
                  ? null
                  : current.dailyBudgetPercent === null
                    ? OFF
                    : String(current.dailyBudgetPercent)
              }
              onValueChange={(value) => {
                if (value === OFF) save({ ...current, dailyBudgetPercent: null, usageModel: null });
                else if (value !== null)
                  save({
                    ...current,
                    dailyBudgetPercent: Number(value),
                    usageModel: current.usageModel ?? "haiku",
                  });
              }}
            >
              <SelectTrigger size="sm" aria-label={gt("Daily usage budget for subagents")}>
                <SelectValue>
                  {(value: string | null) =>
                    value === OFF
                      ? gt("Off", { $context: "usage-based subagent model disabled" })
                      : value === null
                        ? mixedLabel
                        : gt("After {percent}% of today", { percent: value })
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value={OFF}>
                  {gt("Off", { $context: "usage-based subagent model disabled" })}
                </SelectItem>
                {DAILY_BUDGETS.map((percent) => (
                  <SelectItem key={percent} value={String(percent)}>
                    {gt("After {percent}% of today", { percent })}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {current.dailyBudgetPercent !== null && !mixed ? (
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
