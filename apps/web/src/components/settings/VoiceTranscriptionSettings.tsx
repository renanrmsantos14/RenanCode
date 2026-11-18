import { VoiceTranscriptionSettings as VoiceTranscriptionSettingsSchema } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { T, useGT } from "gt-react";
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
  const gt = useGT();
  const { environment, scope } = useSettingsScope();
  if (scope.kind !== "environment" || !environment) {
    return (
      <SettingsSection title={gt("Voice dictation")} id="voice-dictation">
        <SettingsScopeNotice target="environment">
          {gt("Choose one environment to configure voice dictation.")}
        </SettingsScopeNotice>
      </SettingsSection>
    );
  }
  return <VoiceTranscriptionForm key={environment.environmentId} />;
}

function VoiceTranscriptionForm() {
  const gt = useGT();
  const { environment } = useSettingsScope();
  const saved = useScopedSettings((settings) => settings.voiceTranscription);
  const [draft, setDraft] = useState<Record<string, unknown> | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const canEdit = useAtomValue(
    serverEnvironment.updateSettings.permissionAtom(environment?.environmentId ?? null),
  );
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: true });

  return (
    <SettingsSection title={gt("Voice dictation")} id="voice-dictation">
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
          {saved.apiKey === ""
            ? gt(
                "Uses Groq's free Whisper by default. Create a key at console.groq.com. Not configured.",
              )
            : gt("Uses Groq's free Whisper by default. Create a key at console.groq.com.")}
        </p>
        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            {environment
              ? gt("This connection lacks permission to change settings on {environment}.", {
                  environment: environment.label,
                })
              : gt(
                  "This connection lacks permission to change settings on the selected environment.",
                )}
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
            <T>Save</T>
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
