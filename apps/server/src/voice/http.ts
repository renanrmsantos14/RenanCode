import { AuthOrchestrationOperateScope, EnvironmentHttpApi } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";

import { annotateEnvironmentRequest, requireEnvironmentScope } from "../auth/http.ts";
import * as VoiceTranscription from "./VoiceTranscription.ts";

export const layer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "voice",
  Effect.fnUntraced(function* (handlers) {
    const voice = yield* VoiceTranscription.VoiceTranscription;
    return handlers.handle(
      "transcribe",
      Effect.fn("environment.voice.transcribe")(function* (args) {
        yield* annotateEnvironmentRequest(args.endpoint.name);
        yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
        return yield* voice.transcribe({
          audio: args.payload,
          mimeType: args.query.mimeType,
          language: args.query.language,
        });
      }),
    );
  }),
);
