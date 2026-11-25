import { useGT, useMessages } from "gt-react";

import {
  getClientSettings,
  updateClientSettings,
  useClientSettings,
} from "../../hooks/useSettings";
import {
  resolveSidebarRowVisibility,
  setSidebarRowItem,
  SIDEBAR_ROW_ITEMS,
} from "../sidebar/sidebarRowItems";
import { Switch } from "../ui/switch";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";
import { SidebarRowPreview } from "./SidebarRowPreview";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

/** How the boring sidebar groups threads and what each folder row shows, with a live preview. */
export function SidebarSettingsPanel() {
  const gt = useGT();
  return (
    <SettingsPageContainer>
      <SettingsSection id="sidebar-preview" title={gt("Preview", { $context: "settings section" })}>
        <SidebarRowPreview />
      </SettingsSection>
      <SettingsSection id="sidebar-layout" title={gt("Layout", { $context: "settings section" })}>
        <BoringSidebarRow />
      </SettingsSection>
      <SettingsSection id="sidebar-row" title={gt("Folder rows")}>
        <SidebarRowItemsRows />
        <SidebarRowHighlightRow />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function BoringSidebarRow() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar")}
      devicePreference
      description={gt(
        "Group sidebar threads into project folders. Pinned threads stay on top, and Snoozed and Settled stay below the folders.",
      )}
      control={
        <Switch
          checked={settings.boringSidebarEnabled}
          onCheckedChange={(checked) => updateSettings({ boringSidebarEnabled: Boolean(checked) })}
          aria-label={gt("Boring sidebar (group by project)")}
        />
      }
    >
      {settings.boringSidebarEnabled ? (
        <div className="mt-2 mb-2 border-l-2 border-border/60 ps-3">
          <BoringSidebarMultilineRow />
        </div>
      ) : null}
    </SettingsRow>
  );
}

function BoringSidebarMultilineRow() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar-multiline")}
      devicePreference
      className="px-0 py-2 sm:px-0"
      description={gt(
        "Show folder threads on two lines: the title, then the branch, pull request, and agent.",
      )}
      control={
        <Switch
          checked={settings.boringSidebarMultilineRows}
          onCheckedChange={(checked) =>
            updateSettings({ boringSidebarMultilineRows: Boolean(checked) })
          }
          aria-label={gt("Two-line folder rows")}
        />
      }
    />
  );
}

function SidebarRowItemsRows() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const m = useMessages();
  const visibility = useClientSettings(resolveSidebarRowVisibility);
  const multiline = useClientSettings((settings) => settings.boringSidebarMultilineRows);
  const hidden = SIDEBAR_ROW_ITEMS.filter((item) => !visibility[item.id]).length;
  return (
    <>
      <SettingsRow
        {...searchableSetting("sidebar-row-items")}
        description={gt(
          "Choose what a folder row shows. Pull request status takes the place of Done or Waiting while checks run, a merge waits, or a deploy goes.",
        )}
        resetAction={
          hidden === 0 ? null : (
            <SettingResetButton
              ariaLabel={gt("Reset folder row details to default")}
              onClick={() => updateClientSettings({ sidebarRowItems: {} })}
            />
          )
        }
      />
      {SIDEBAR_ROW_ITEMS.map((item) => (
        <SettingsRow
          key={item.id}
          id={`sidebar-row-item-${item.id}`}
          title={m(item.label)}
          description={item.twoLineOnly && !multiline ? gt("Shows on two-line rows.") : undefined}
          control={
            <Switch
              checked={visibility[item.id]}
              onCheckedChange={(checked) =>
                updateClientSettings({
                  sidebarRowItems: setSidebarRowItem(
                    getClientSettings(),
                    item.id,
                    Boolean(checked),
                  ),
                })
              }
              aria-label={m(item.label)}
            />
          }
        />
      ))}
    </>
  );
}

function SidebarRowHighlightRow() {
  const searchableSetting = useSearchableSetting();
  const gt = useGT();
  const highlight = useClientSettings((settings) => settings.sidebarRowHighlight);
  return (
    <SettingsRow
      {...searchableSetting("sidebar-row-highlight")}
      description={gt(
        "Tint a folder row green when its pull request is ready to merge, and red when its checks, merge, or deploy failed.",
      )}
      control={
        <Switch
          checked={highlight}
          onCheckedChange={(checked) =>
            updateClientSettings({ sidebarRowHighlight: Boolean(checked) })
          }
          aria-label={gt("Highlight pull request rows")}
        />
      }
    />
  );
}
