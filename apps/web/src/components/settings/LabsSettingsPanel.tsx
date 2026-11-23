import { msg } from "gt-react";
import { managedCapabilityDenial } from "@t3tools/client-runtime/contract-labels";
import { useAuth } from "@clerk/react";
import { Link } from "@tanstack/react-router";
import { AgentFeedbackMode } from "@t3tools/contracts";
import { T, useGT, useMessages } from "gt-react";

import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { useT3ConnectAuthPrompt } from "../clerk/useT3ConnectAuthPrompt";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { ScopedSwitch } from "./ScopedSwitch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import {
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";
import { LegacyFeaturesSection } from "./SettingsPanels";
import { useOptionalSettingsScope, useSettingsScope } from "./SettingsScopeContext";
import { firstManagedDenial, usePrimaryManagedPolicy } from "~/state/managedPolicy";

/** Features still settling in, and legacy behavior kept for people who rely on it. */
export function LabsSettingsPanel() {
  const gt = useGT();
  return (
    <SettingsPageContainer>
      <SettingsSection id="beta" title={gt("Beta")}>
        {/* Clerk is only mounted when this build has T3 Connect. */}
        {hasCloudPublicConfig() ? <GuestLinksRowWithSignIn /> : <GuestLinksRow />}
        <LinkedEnvironmentsRow />
        <ClaudeCloudSessionsRow />
        <ClaudeCloudAutoRoutingRow />
        <WorkflowsRow />
        <PromptSuggestionsRow />
        <SimlockHostsRow />
        <FastWorktreeCheckoutRow />
        <AgentFeedbackRow />
      </SettingsSection>
      <LegacyFeaturesSection />
    </SettingsPageContainer>
  );
}

/** Signed out of T3 Connect, the row offers to sign in instead of its switch. */
function GuestLinksRowWithSignIn() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const { isSignedIn } = useAuth();
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  // `isSignedIn` is undefined until Clerk loads.
  if (isSignedIn !== false) return <GuestLinksRow />;
  return (
    <SettingsRow
      {...searchableSetting("guest-links")}
      description={gt(
        "Share a thread with a guest who watches it live in a browser and sends messages you approve. Sign in to T3 Connect to use guest links.",
      )}
      control={
        <Button size="sm" variant="outline" onClick={openAuthPrompt}>
          <T>Sign in</T>
        </Button>
      }
    />
  );
}

function GuestLinksRow() {
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  const messages = useMessages();
  const scope = useOptionalSettingsScope();
  const primaryPolicy = usePrimaryManagedPolicy();
  // Guests arrive through T3 Connect, so a policy that turns Connect off turns this off too.
  const connectDenial = firstManagedDenial(
    scope
      ? scope.connectedEnvironments.map((environment) => environment.serverConfig?.managedPolicy)
      : [primaryPolicy],
    (policy) => managedCapabilityDenial(policy, "connect", messages),
  );
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("guest-links")}
      settingKeys={["guestSharingEnabled"]}
      // Turning guest links off still works without T3 Connect.
      managed={settings.guestSharingEnabled ? undefined : connectDenial}
      description={
        <T>
          Share a thread with a guest who watches it live in a browser and sends messages you
          approve. Needs T3 Connect: sign in and link this machine in{" "}
          <Link to="/settings/access" className="underline underline-offset-2">
            Sharing & access
          </Link>
          . Turning it off stops every guest link.
        </T>
      }
      control={
        <ScopedSwitch
          settingKeys={["guestSharingEnabled"]}
          checked={settings.guestSharingEnabled}
          onCheckedChange={(checked) => updateSettings({ guestSharingEnabled: Boolean(checked) })}
          aria-label={gt("Guest links")}
        />
      }
    />
  );
}

function ClaudeCloudSessionsRow() {
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("claude-cloud-sessions-beta")}
      settingKeys={["claudeCloudSessionsEnabled"]}
      description={gt(
        "Show this machine's Claude Code cloud sessions (claude.ai/code) in the project of the same GitHub repository, read-only. Uses the Claude CLI login here and an undocumented API that may change.",
      )}
      control={
        <ScopedSwitch
          settingKeys={["claudeCloudSessionsEnabled"]}
          checked={settings.claudeCloudSessionsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ claudeCloudSessionsEnabled: Boolean(checked) })
          }
          aria-label={gt("Claude cloud sessions")}
        />
      }
    />
  );
}

function ClaudeCloudAutoRoutingRow() {
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  if (!settings.claudeCloudSessionsEnabled) return null;
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("claude-cloud-auto-routing-beta")}
      settingKeys={["claudeCloudAutoRouting"]}
      description={gt(
        "With Run on set to Auto, new Claude drafts go to a cloud session when the task does not need this machine. Sending waits up to 15 seconds for the check.",
      )}
      control={
        <ScopedSwitch
          settingKeys={["claudeCloudAutoRouting"]}
          checked={settings.claudeCloudAutoRouting}
          onCheckedChange={(checked) =>
            updateSettings({ claudeCloudAutoRouting: Boolean(checked) })
          }
          aria-label={gt("Send tasks to the cloud automatically")}
        />
      }
    />
  );
}

function LinkedEnvironmentsRow() {
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("linked-environments-beta")}
      settingKeys={["linkedEnvironmentsEnabled"]}
      description={
        <T>
          Let agents here work on your other machines, and theirs here. Turn it on for each machine,
          then link them in{" "}
          <Link to="/settings/connections" className="underline underline-offset-2">
            Connections
          </Link>
          . While off, nothing new starts over a link; running tasks finish.
        </T>
      }
      control={
        <ScopedSwitch
          settingKeys={["linkedEnvironmentsEnabled"]}
          checked={settings.linkedEnvironmentsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ linkedEnvironmentsEnabled: Boolean(checked) })
          }
          aria-label={gt("Linked environments")}
        />
      }
    />
  );
}

function WorkflowsRow() {
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("workflows-beta")}
      settingKeys={["workflowsEnabled"]}
      description={gt(
        "Run multi-step workflows from files in the workflows folder of this server's T3 home. Open them from the command palette. While off, nothing in that folder runs; runs wait until it is on again.",
      )}
      control={
        <ScopedSwitch
          settingKeys={["workflowsEnabled"]}
          checked={settings.workflowsEnabled}
          onCheckedChange={(checked) => updateSettings({ workflowsEnabled: Boolean(checked) })}
          aria-label={gt("Workflows")}
        />
      }
    />
  );
}

function PromptSuggestionsRow() {
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("prompt-suggestions-beta")}
      settingKeys={["promptSuggestionsEnabled"]}
      description={gt(
        "Show a predicted next message in the empty composer after a Claude or Codex turn. Tab uses it. Each is an extra cached request on your plan. Needs Codex 0.165+. Claude threads update on restart.",
      )}
      control={
        <ScopedSwitch
          settingKeys={["promptSuggestionsEnabled"]}
          checked={settings.promptSuggestionsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ promptSuggestionsEnabled: Boolean(checked) })
          }
          aria-label={gt("Suggest next prompt")}
        />
      }
    />
  );
}

function SimlockHostsRow() {
  const searchableSetting = useSearchableSetting();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("simlock-hosts")}
      settingKeys={["simlockDeviceHostsEnabled"]}
      description={
        <T>
          Let the Device panel lease simulators and emulators from your own{" "}
          <a
            href="https://incubator.callstack.com/simlock/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Simlock
          </a>{" "}
          pool, added in{" "}
          <Link to="/settings/devices" className="underline underline-offset-2">
            Devices
          </Link>
          . An alpha that may change or break. RenanCode never installs Simlock.
        </T>
      }
      control={
        <ScopedSwitch
          settingKeys={["simlockDeviceHostsEnabled"]}
          checked={settings.simlockDeviceHostsEnabled}
          onCheckedChange={(checked) =>
            updateSettings({ simlockDeviceHostsEnabled: Boolean(checked) })
          }
          aria-label={gt("Simlock device hosts")}
        />
      }
    />
  );
}

/** Shows only when every machine in scope is a Mac, since only macOS servers honor it. */
function FastWorktreeCheckoutRow() {
  const searchableSetting = useSearchableSetting();
  const { scope, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  if (
    scope.kind === "project" ||
    scope.kind === "checkout" ||
    connectedEnvironments.length === 0 ||
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.fastWorktreeCheckout !== true,
    )
  )
    return null;
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("worktree-fast-checkout")}
      settingKeys={["fastWorktreeCheckout"]}
      description={gt(
        "On a Mac, clone new worktrees from a checkout cached in the T3 home folder instead of writing every file. Uses Git’s normal checkout when it can’t. Turning it off deletes the cache.",
      )}
      control={
        <ScopedSwitch
          settingKeys={["fastWorktreeCheckout"]}
          checked={settings.fastWorktreeCheckout}
          onCheckedChange={(checked) => updateSettings({ fastWorktreeCheckout: Boolean(checked) })}
          aria-label={gt("Fast worktree checkout")}
        />
      }
    />
  );
}

/** Shows only when every machine in scope honors it; older servers drop the setting. */
const AGENT_FEEDBACK_MODES = AgentFeedbackMode.literals;
const AGENT_FEEDBACK_MODE_LABELS: Record<AgentFeedbackMode, string> = {
  off: msg("Off"),
  "on-request": msg("When I ask"),
  auto: msg("Automatic"),
};
const AGENT_FEEDBACK_MODE_DESCRIPTIONS: Record<AgentFeedbackMode, string> = {
  off: msg("Agents send no feedback to the T3 team."),
  "on-request": msg(
    "When you ask, agents show you a short report about T3 Code and send it to the T3 team if you approve.",
  ),
  auto: msg(
    "Agents also report T3 Code problems they hit on their own, such as a T3 tool that failed.",
  ),
};

function AgentFeedbackRow() {
  const searchableSetting = useSearchableSetting();
  const { scope, connectedEnvironments } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const gt = useGT();
  const m = useMessages();
  const mixed = useScopedSettingsMixed(["agentFeedback"]);
  if (
    scope.kind === "project" ||
    scope.kind === "checkout" ||
    connectedEnvironments.length === 0 ||
    connectedEnvironments.some(
      (environment) => environment.serverConfig?.environment.capabilities.agentFeedback !== true,
    )
  )
    return null;
  return (
    <SettingsRow
      serverScoped
      {...searchableSetting("agent-feedback")}
      settingKeys={["agentFeedback"]}
      description={
        mixed
          ? gt("The selected machines use different agent feedback modes.")
          : m(AGENT_FEEDBACK_MODE_DESCRIPTIONS[settings.agentFeedback.mode])
      }
      control={
        <Select
          value={mixed ? null : settings.agentFeedback.mode}
          onValueChange={(mode) => {
            if (mode !== null) updateSettings({ agentFeedback: { mode } });
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-40" aria-label={gt("Agent feedback")}>
            <SelectValue>
              {(mode: AgentFeedbackMode | null) =>
                mode === null ? gt("Mixed") : m(AGENT_FEEDBACK_MODE_LABELS[mode])
              }
            </SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {AGENT_FEEDBACK_MODES.map((mode) => (
              <SelectItem key={mode} hideIndicator value={mode}>
                {m(AGENT_FEEDBACK_MODE_LABELS[mode])}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}
