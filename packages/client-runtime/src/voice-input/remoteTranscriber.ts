import { squashAtomCommandFailure } from "../state/runtime.ts";
import { throwIfVoiceTranscriptionAborted, VoiceTranscriptionError } from "./transcription.ts";
import type { VoiceTranscriber } from "./transcription.ts";

export function createRemoteVoiceTranscriber(input: {
  readonly language: string;
  readonly readAudio: (
    uri: string,
    signal: AbortSignal,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType: string }>;
  readonly send: (audio: {
    readonly bytes: Uint8Array;
    readonly mimeType: string;
  }) => Promise<
    | { readonly _tag: "Success"; readonly text: string }
    | { readonly _tag: "Failure"; readonly reason: string | null }
  >;
}): VoiceTranscriber {
  return {
    prepare: async ({ signal }) => {
      throwIfVoiceTranscriptionAborted(signal);
      return {
        locale: input.language,
        transcribe: async (uri, { signal }) => {
          const audio = await input.readAudio(uri, signal);
          throwIfVoiceTranscriptionAborted(signal);
          const result = await input.send(audio);
          throwIfVoiceTranscriptionAborted(signal);
          if (result._tag === "Success") return result.text;
          if (result.reason === "rate-limited" || result.reason === "not-configured") {
            throw new VoiceTranscriptionError(result.reason, result.reason);
          }
          throw new VoiceTranscriptionError("transcription-failed", result.reason ?? "failed");
        },
      };
    },
  };
}

/** The `reason` of a failed voice transcribe command, or null for any other failure. */
export function voiceFailureReason(
  result: Parameters<typeof squashAtomCommandFailure>[0],
): string | null {
  const error = squashAtomCommandFailure(result);
  if (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === "VoiceTranscriptionError" &&
    "reason" in error &&
    typeof error.reason === "string"
  ) {
    return error.reason;
  }
  return null;
}
