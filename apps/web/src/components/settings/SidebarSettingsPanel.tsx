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
import { searchableSetting } from "./settingsSearch";
import { SidebarRowPreview } from "./SidebarRowPreview";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

/** How the boring sidebar groups threads and what each folder row shows, with a live preview. */
export function SidebarSettingsPanel() {
  return (
    <SettingsPageContainer>
      <SettingsSection id="sidebar-preview" title="Preview">
        <SidebarRowPreview />
      </SettingsSection>
      <SettingsSection id="sidebar-layout" title="Layout">
        <BoringSidebarRow />
        <BoringSidebarMultilineRow />
      </SettingsSection>
      <SettingsSection id="sidebar-row" title="Folder rows">
        <SidebarRowItemsRows />
        <SidebarRowHighlightRow />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function BoringSidebarRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar")}
      description="Group sidebar threads into project folders. Pinned threads stay on top, and Snoozed and Settled stay below the folders."
      control={
        <Switch
          checked={settings.boringSidebarEnabled || settings.legacySidebarEnabled}
          // Turning it off also clears the opt-in of the removed legacy sidebar.
          onCheckedChange={(checked) =>
            updateSettings({ boringSidebarEnabled: Boolean(checked), legacySidebarEnabled: false })
          }
          aria-label="Boring sidebar (group by project)"
        />
      }
    />
  );
}

function BoringSidebarMultilineRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("boring-sidebar-multiline")}
      description="Show folder threads on two lines: the title, then the branch, pull request, and agent."
      control={
        <Switch
          checked={settings.boringSidebarMultilineRows}
          onCheckedChange={(checked) =>
            updateSettings({ boringSidebarMultilineRows: Boolean(checked) })
          }
          aria-label="Two-line folder rows"
        />
      }
    />
  );
}

function SidebarRowItemsRows() {
  const visibility = useClientSettings(resolveSidebarRowVisibility);
  const multiline = useClientSettings((settings) => settings.boringSidebarMultilineRows);
  const hidden = SIDEBAR_ROW_ITEMS.filter((item) => !visibility[item.id]).length;
  return (
    <>
      <SettingsRow
        {...searchableSetting("sidebar-row-items")}
        description="Choose what a folder row shows. Pull request status takes the place of Done or Waiting while checks run, a merge waits, or a deploy goes."
        resetAction={
          hidden === 0 ? null : (
            <SettingResetButton
              label="folder row details"
              onClick={() => updateClientSettings({ sidebarRowItems: {} })}
            />
          )
        }
      />
      {SIDEBAR_ROW_ITEMS.map((item) => (
        <SettingsRow
          key={item.id}
          id={`sidebar-row-item-${item.id}`}
          title={item.label}
          description={item.twoLineOnly && !multiline ? "Shows on two-line rows." : undefined}
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
              aria-label={item.label}
            />
          }
        />
      ))}
    </>
  );
}

function SidebarRowHighlightRow() {
  const highlight = useClientSettings((settings) => settings.sidebarRowHighlight);
  return (
    <SettingsRow
      {...searchableSetting("sidebar-row-highlight")}
      description="Tint a folder row green when its pull request is ready to merge, and red when its checks, merge, or deploy failed."
      control={
        <Switch
          checked={highlight}
          onCheckedChange={(checked) =>
            updateClientSettings({ sidebarRowHighlight: Boolean(checked) })
          }
          aria-label="Highlight pull request rows"
        />
      }
    />
  );
}
