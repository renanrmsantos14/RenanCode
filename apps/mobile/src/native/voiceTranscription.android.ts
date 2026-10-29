import type { EnvironmentId } from "@t3tools/contracts";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import {
  createRemoteVoiceTranscriber,
  voiceFailureReason,
  type VoiceTranscriber,
} from "@t3tools/client-runtime/voice-input";
import { File } from "expo-file-system";

import { appAtomRegistry } from "../state/atom-registry";
import { voiceEnvironment } from "../state/voice";

export const REMOTE_VOICE_TRANSCRIPTION = true;

export function getLocalVoiceTranscriber(
  environmentId: EnvironmentId | null,
): VoiceTranscriber | null {
  if (environmentId === null) return null;
  return createRemoteVoiceTranscriber({
    language: "",
    readAudio: async (uri) => ({ bytes: await new File(uri).bytes(), mimeType: "audio/mp4" }),
    send: async (audio) => {
      const result = await runAtomCommand(
        appAtomRegistry,
        voiceEnvironment.transcribe,
        { environmentId, input: { audio: audio.bytes, mimeType: audio.mimeType } },
        { reportFailure: false },
      );
      return result._tag === "Success"
        ? { _tag: "Success", text: result.value.text }
        : { _tag: "Failure", reason: voiceFailureReason(result) };
    },
  });
}
