import * as Effect from "effect/Effect";
import type * as Option from "effect/Option";

import type { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import type { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";

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
  return yield* executeAuthenticatedEnvironmentHttpRequest({
    prepared: input.prepared,
    signer: input.signer,
    ...(input.remoteAuthorization ? { remoteAuthorization: input.remoteAuthorization } : {}),
    group: "voice",
    method: "POST",
    url: (urls) => urls.transcribe({ query }),
    timeoutMs: 120_000,
    request: ({ client, headers }) => client.transcribe({ query, payload: input.audio, headers }),
  });
});
