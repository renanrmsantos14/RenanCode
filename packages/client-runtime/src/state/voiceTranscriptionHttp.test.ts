import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { PreparedConnection } from "../connection/model.ts";
import * as RpcHttp from "../rpc/http.ts";
import { postEnvironmentVoiceTranscription } from "./voiceTranscriptionHttp.ts";

const prepared = {
  environmentId: EnvironmentId.make("environment-1"),
  label: "Desktop",
  httpBaseUrl: "https://desktop.example.test/",
  socketUrl: "wss://desktop.example.test/ws",
  httpAuthorization: { _tag: "Bearer", token: "token" },
  target: { _tag: "BearerConnectionTarget" },
} as unknown as PreparedConnection;

describe("postEnvironmentVoiceTranscription", () => {
  it.effect("keeps the server's transcription failure reason", () => {
    const fetchFn = (() =>
      Promise.resolve(
        Response.json(
          { _tag: "VoiceTranscriptionError", reason: "not-configured" },
          { status: 502 },
        ),
      )) satisfies typeof globalThis.fetch;

    return Effect.gen(function* () {
      const error = yield* postEnvironmentVoiceTranscription({
        prepared,
        audio: new Uint8Array([1, 2, 3]),
        mimeType: "audio/mp4",
        signer: Option.none(),
      }).pipe(Effect.flip);

      expect(error).toMatchObject({ _tag: "VoiceTranscriptionError", reason: "not-configured" });
    }).pipe(Effect.provide(RpcHttp.layerRemoteHttpClient(fetchFn)));
  });
});
