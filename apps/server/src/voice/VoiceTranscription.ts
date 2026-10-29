import {
  VOICE_TRANSCRIPTION_MAX_BYTES,
  VoiceTranscriptionError,
  type VoiceTranscriptionResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import * as ServerSettings from "../serverSettings.ts";

const TranscriptionBody = Schema.Struct({ text: Schema.optional(Schema.String) });

// The provider infers the codec from the file name, not the part's content type.
const extensionForMimeType = (mimeType: string) => {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/x-m4a") return "m4a";
  if (base === "audio/wav" || base === "audio/x-wav") return "wav";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
};

export class VoiceTranscription extends Context.Service<
  VoiceTranscription,
  {
    readonly transcribe: (input: {
      readonly audio: Uint8Array;
      readonly mimeType: string;
      readonly language?: string | undefined;
    }) => Effect.Effect<VoiceTranscriptionResult, VoiceTranscriptionError>;
  }
>()("t3/voice/VoiceTranscription") {}

const make = Effect.gen(function* () {
  const settings = yield* ServerSettings.ServerSettingsService;
  const httpClient = yield* HttpClient.HttpClient;

  const transcribe = Effect.fn("VoiceTranscription.transcribe")(function* (input: {
    readonly audio: Uint8Array;
    readonly mimeType: string;
    readonly language?: string | undefined;
  }) {
    const config = (yield* settings.getSettings.pipe(
      Effect.mapError((cause) => new VoiceTranscriptionError({ reason: "failed", cause })),
    )).voiceTranscription;
    if (config.apiKey === "")
      return yield* new VoiceTranscriptionError({ reason: "not-configured" });
    if (input.audio.byteLength > VOICE_TRANSCRIPTION_MAX_BYTES) {
      return yield* new VoiceTranscriptionError({ reason: "too-large" });
    }

    const form = new FormData();
    form.append(
      "file",
      new Blob([input.audio], { type: input.mimeType }),
      `audio.${extensionForMimeType(input.mimeType)}`,
    );
    form.append("model", config.model);
    form.append("response_format", "json");
    const language = input.language ?? config.language;
    if (language !== "") form.append("language", language);

    const response = yield* httpClient
      .execute(
        HttpClientRequest.post(`${config.baseUrl.replace(/\/+$/, "")}/audio/transcriptions`).pipe(
          HttpClientRequest.bearerToken(config.apiKey),
          HttpClientRequest.bodyFormData(form),
        ),
      )
      .pipe(Effect.mapError((cause) => new VoiceTranscriptionError({ reason: "failed", cause })));
    if (response.status === 401 || response.status === 403) {
      return yield* new VoiceTranscriptionError({ reason: "invalid-key", status: response.status });
    }
    if (response.status === 429) {
      return yield* new VoiceTranscriptionError({ reason: "rate-limited", status: 429 });
    }
    if (response.status < 200 || response.status >= 300) {
      return yield* new VoiceTranscriptionError({ reason: "failed", status: response.status });
    }
    const body = yield* HttpClientResponse.schemaBodyJson(TranscriptionBody)(response).pipe(
      Effect.mapError((cause) => new VoiceTranscriptionError({ reason: "failed", cause })),
    );
    return { text: body.text?.trim() ?? "" };
  });

  return VoiceTranscription.of({ transcribe });
});

export const layer = Layer.effect(VoiceTranscription, make);
