import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import type { HttpClient } from "effect/http";
import type { Atom } from "effect/reactivity";

import { createEnvironmentCommand } from "./runtime.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import * as ManagedRelayDpopSigner from "../relay/managedRelay.ts";
import { EnvironmentRpcUnavailableError } from "../rpc/client.ts";
import { postEnvironmentVoiceTranscription } from "./voiceTranscriptionHttp.ts";

export function createVoiceEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | HttpClient.HttpClient | R, E>,
) {
  return {
    transcribe: createEnvironmentCommand(runtime, {
      label: "environment-command:voice:transcribe",
      execute: Effect.fn("voice.transcribe")(function* (input: {
        readonly audio: Uint8Array;
        readonly mimeType: string;
        readonly language?: string;
      }) {
        const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
        const prepared = yield* SubscriptionRef.get(supervisor.prepared);
        if (Option.isNone(prepared)) {
          return yield* new EnvironmentRpcUnavailableError({
            environmentId: supervisor.target.environmentId,
            message: "The source environment is not connected.",
          });
        }
        return yield* postEnvironmentVoiceTranscription({
          prepared: prepared.value,
          audio: input.audio,
          mimeType: input.mimeType,
          language: input.language,
          signer: yield* Effect.serviceOption(ManagedRelayDpopSigner.ManagedRelayDpopSigner),
          remoteAuthorization: yield* Effect.serviceOption(
            RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization,
          ),
        });
      }),
    }),
  };
}
