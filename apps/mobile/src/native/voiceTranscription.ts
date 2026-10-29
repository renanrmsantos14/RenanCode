import type { EnvironmentId } from "@t3tools/contracts";
import type { VoiceTranscriber } from "@t3tools/client-runtime/voice-input";

export const REMOTE_VOICE_TRANSCRIPTION = false;

export function getLocalVoiceTranscriber(
  _environmentId: EnvironmentId | null,
): VoiceTranscriber | null {
  return null;
}
