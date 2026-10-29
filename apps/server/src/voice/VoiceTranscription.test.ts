import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import * as ServerSettings from "../serverSettings.ts";
import * as VoiceTranscription from "./VoiceTranscription.ts";

const harness = (
  voiceTranscription: { readonly apiKey?: string },
  reply: { readonly status: number; readonly body: unknown },
) => {
  const requests: Array<HttpClientRequest.HttpClientRequest> = [];
  const layer = VoiceTranscription.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        ServerSettings.layerTest({ voiceTranscription }),
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.sync(() => {
              requests.push(request);
              return HttpClientResponse.fromWeb(
                request,
                new Response(JSON.stringify(reply.body), {
                  status: reply.status,
                  headers: { "content-type": "application/json" },
                }),
              );
            }),
          ),
        ),
      ),
    ),
  );
  return { requests, layer };
};

const audio = new Uint8Array([1, 2, 3]);
const mimeType = "audio/webm;codecs=opus";

const cases = [
  { name: "200", status: 200, body: { text: "  olá mundo " }, expected: { text: "olá mundo" } },
  { name: "empty text", status: 200, body: {}, expected: { text: "" } },
  { name: "401", status: 401, body: {}, reason: "invalid-key" },
  { name: "429", status: 429, body: {}, reason: "rate-limited" },
  { name: "500", status: 500, body: {}, reason: "failed" },
] as const;

it.effect.each(cases)("maps a $name provider reply", (testCase) => {
  const { layer } = harness({ apiKey: "gsk_test" }, testCase);
  return Effect.gen(function* () {
    const service = yield* VoiceTranscription.VoiceTranscription;
    const exit = yield* Effect.exit(service.transcribe({ audio, mimeType }));
    if ("expected" in testCase) {
      assert.deepStrictEqual(Exit.isSuccess(exit) && exit.value, testCase.expected);
    } else {
      assert.isTrue(Exit.isFailure(exit));
      assert.include(JSON.stringify(exit), testCase.reason);
    }
  }).pipe(Effect.provide(layer));
});

it.effect("posts multipart to the configured API and sends language only when given", () => {
  const { layer, requests } = harness({ apiKey: "gsk_test" }, { status: 200, body: { text: "x" } });
  return Effect.gen(function* () {
    const service = yield* VoiceTranscription.VoiceTranscription;
    yield* service.transcribe({ audio, mimeType });
    yield* service.transcribe({ audio, mimeType, language: "pt" });
    const [first, second] = requests;
    assert.equal(first?.url, "https://api.groq.com/openai/v1/audio/transcriptions");
    assert.equal(first?.headers.authorization, "Bearer gsk_test");
    assert.equal(first?.body._tag, "FormData");
    const form = first?.body._tag === "FormData" ? first.body.formData : undefined;
    const file = form?.get("file");
    assert.isTrue(file instanceof File);
    assert.equal(file instanceof File && file.name, "audio.webm");
    assert.equal(file instanceof File && file.type, mimeType);
    assert.equal(form?.get("model"), "whisper-large-v3-turbo");
    assert.equal(form?.get("response_format"), "json");
    assert.isFalse(form?.has("language"));
    const secondForm = second?.body._tag === "FormData" ? second.body.formData : undefined;
    assert.equal(secondForm?.get("language"), "pt");
  }).pipe(Effect.provide(layer));
});

it.effect("does not call the provider without a key", () => {
  const { layer, requests } = harness({}, { status: 200, body: { text: "x" } });
  return Effect.gen(function* () {
    const service = yield* VoiceTranscription.VoiceTranscription;
    const exit = yield* Effect.exit(service.transcribe({ audio, mimeType }));
    assert.isTrue(Exit.isFailure(exit));
    assert.include(JSON.stringify(exit), "not-configured");
    assert.equal(requests.length, 0);
  }).pipe(Effect.provide(layer));
});
