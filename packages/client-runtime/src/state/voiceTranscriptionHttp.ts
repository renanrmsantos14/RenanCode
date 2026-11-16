import { VoiceTranscriptionError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Option from "effect/Option";

import type { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import type { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";

const isVoiceTranscriptionError = Schema.is(VoiceTranscriptionError);

export const postEnvironmentVoiceTranscription = Effect.fn(
  "clientRuntime.state.postEnvironmentVoiceTranscription",
)(function* (input: {
  readonly prepared: PreparedConnection;
  readonly audio: Uint8Array;
  readonly mimeType: string;
  readonly language?: string | undefined;
  readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
  readonly remoteAuthorization?: Option.Option<RemoteEnvironmentAuthorization["Service"]>;
}) {
  const query = {
    mimeType: input.mimeType,
    ...(input.language ? { language: input.language } : {}),
  };
  const result = yield* executeAuthenticatedEnvironmentHttpRequest({
    prepared: input.prepared,
    signer: input.signer,
    ...(input.remoteAuthorization ? { remoteAuthorization: input.remoteAuthorization } : {}),
    group: "voice",
    method: "POST",
    url: (urls) => urls.transcribeApiKey({ query }),
    timeoutMs: 120_000,
    // The shared request wrapper replaces undeclared errors with a generic fetch error.
    request: ({ client, headers }) =>
      client
        .transcribeApiKey({ query, payload: input.audio, headers })
        .pipe(Effect.catchTags({ VoiceTranscriptionError: (error) => Effect.succeed(error) })),
  });
  if (isVoiceTranscriptionError(result)) return yield* result;
  return result;
});
