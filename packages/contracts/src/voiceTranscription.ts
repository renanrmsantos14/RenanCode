import * as Schema from "effect/Schema";
import * as HttpServerRespondable from "effect/http/HttpServerRespondable";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

export const VOICE_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024;

export const VoiceTranscriptionErrorReason = Schema.Literals([
  "not-configured",
  "invalid-key",
  "rate-limited",
  "too-large",
  "failed",
]);

export class VoiceTranscriptionError extends Schema.TaggedError<VoiceTranscriptionError>()(
  "VoiceTranscriptionError",
  {
    reason: VoiceTranscriptionErrorReason,
    status: Schema.optional(Schema.Number),
    cause: Schema.optional(Schema.Defect()),
  },
  { httpApiStatus: 502 },
) {
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.schemaJson(VoiceTranscriptionError)(this, { status: 502 });
  }

  override get message(): string {
    return `Voice transcription failed: ${this.reason}.`;
  }
}

export const VoiceTranscriptionResult = Schema.Struct({ text: Schema.String });
export type VoiceTranscriptionResult = typeof VoiceTranscriptionResult.Type;

export const VoiceTranscriptionQuery = Schema.Struct({
  mimeType: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  language: Schema.optional(Schema.String.check(Schema.isMaxLength(16))),
});
