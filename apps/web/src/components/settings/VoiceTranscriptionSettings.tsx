import { VoiceTranscriptionSettings as VoiceTranscriptionSettingsSchema } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { ProviderSettingsForm } from "./ProviderSettingsForm";
import { useSettingsScope } from "./SettingsScopeContext";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import { SettingsSection } from "./settingsLayout";
import { useScopedSettings } from "./useScopedSettings";

const DEFINITION = { settingsSchema: VoiceTranscriptionSettingsSchema };

export function VoiceTranscriptionSettings() {
  const { environment, scope } = useSettingsScope();
  if (scope.kind !== "environment" || !environment) {
    return (
      <SettingsSection title="Voice dictation" id="voice-dictation">
        <SettingsScopeNotice target="environment">
          Choose one environment to configure voice dictation.
        </SettingsScopeNotice>
      </SettingsSection>
    );
  }
  return <VoiceTranscriptionForm key={environment.environmentId} />;
}

function VoiceTranscriptionForm() {
  const { environment } = useSettingsScope();
  const saved = useScopedSettings((settings) => settings.voiceTranscription);
  const [draft, setDraft] = useState<Record<string, unknown> | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const canEdit = useAtomValue(
    serverEnvironment.updateSettings.permissionAtom(environment?.environmentId ?? null),
  );
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: true });

  return (
    <SettingsSection title="Voice dictation" id="voice-dictation">
      <form
        className="grid gap-4 px-4 py-4 sm:px-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!environment || saving || draft === undefined) return;
          setSaving(true);
          const result = await updateSettings({
            environmentId: environment.environmentId,
            input: { patch: { voiceTranscription: draft } },
          });
          setSaving(false);
          if (result._tag === "Success") setDraft(undefined);
        }}
      >
        <p className="text-xs text-muted-foreground">
          Uses Groq's free Whisper by default. Create a key at console.groq.com.
          {saved.apiKey === "" ? " Not configured." : null}
        </p>
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            This connection lacks permission to change settings on{" "}
            {environment?.label ?? "the selected environment"}.
          </p>
        )}
        <ProviderSettingsForm
          definition={DEFINITION}
          value={draft ?? saved}
          idPrefix="voice-transcription"
          variant="settings"
          onChange={(next) => setDraft(next ?? {})}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={!canEdit || saving || draft === undefined}>
            Save
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
