import type { EnvironmentId } from "@t3tools/contracts";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import {
  createRemoteVoiceTranscriber,
  VoiceInputController,
  voiceFailureReason,
  type VoiceInputState,
} from "@t3tools/client-runtime/voice-input";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { appAtomRegistry } from "../../../rpc/atomRegistry";
import { voiceEnvironment } from "../../../state/voice";
import { createWebVoiceRecorder, type WebVoiceRecorder } from "./webVoiceRecorder";

const IDLE_STATE: VoiceInputState = { phase: "idle", error: null, errorAction: null };

export type ComposerVoiceInput = {
  readonly state: VoiceInputState;
  readonly available: boolean;
  readonly elapsedSeconds: number;
  readonly level: () => number;
  readonly toggle: () => void;
  readonly stop: () => void;
  readonly cancel: () => void;
};

export function useComposerVoiceInput(input: {
  readonly environmentId: EnvironmentId;
  readonly ownerKey: string;
  readonly enabled: boolean;
  readonly prompt: string;
  readonly readCursor: () => number;
  readonly commit: (text: string, cursor: number) => void;
}): ComposerVoiceInput {
  const [state, setState] = useState<VoiceInputState>(IDLE_STATE);
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const latest = useRef(input);
  const revision = useRef({ prompt: input.prompt, value: 0 });
  const session = useRef<{ controller: VoiceInputController; recorder: WebVoiceRecorder } | null>(
    null,
  );

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the microphone and controller lifecycle
  useEffect(() => {
    let controller: VoiceInputController | null = null;
    const recorder = createWebVoiceRecorder((status) => {
      void controller?.handleRecorderStatus(status);
    });
    controller = new VoiceInputController({
      recorder,
      getTranscriber: () =>
        createRemoteVoiceTranscriber({
          language: "",
          readAudio: async (uri) => {
            const blob = await (await fetch(uri)).blob();
            return {
              bytes: new Uint8Array(await blob.arrayBuffer()),
              mimeType: blob.type || "audio/webm",
            };
          },
          send: async (audio) => {
            const result = await runAtomCommand(
              appAtomRegistry,
              voiceEnvironment.transcribe,
              {
                environmentId: latest.current.environmentId,
                input: { audio: audio.bytes, mimeType: audio.mimeType },
              },
              { reportFailure: false },
            );
            return result._tag === "Success"
              ? { _tag: "Success", text: result.value.text }
              : { _tag: "Failure", reason: voiceFailureReason(result) };
          },
        }),
      requestPermission: async () => ({
        granted: navigator.mediaDevices !== undefined,
        canAskAgain: true,
      }),
      configureRecording: async () => {},
      releaseRecording: async () => {},
      deleteRecording: (uri) => URL.revokeObjectURL(uri),
      readDraft: () => {
        const cursor = latest.current.readCursor();
        return {
          ownerKey: latest.current.ownerKey,
          text: latest.current.prompt,
          selection: { start: cursor, end: cursor },
          revision: revision.current.value,
        };
      },
      commitDraft: (text, selection) => latest.current.commit(text, selection.end),
      onStateChange: (next) => {
        if (next.phase === "recording") {
          const startedAt = Date.now();
          setRecordingStartedAt(startedAt);
          setNow(startedAt);
        }
        setState(next);
      },
    });
    session.current = { controller, recorder };
    return () => {
      controller?.dispose();
      recorder.release();
      session.current = null;
    };
  }, []);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the controller reads the latest draft asynchronously; a new owner abandons an active dictation
  useLayoutEffect(() => {
    const ownerChanged = latest.current.ownerKey !== input.ownerKey;
    latest.current = input;
    if (revision.current.prompt !== input.prompt) {
      revision.current = { prompt: input.prompt, value: revision.current.value + 1 };
    }
    if (ownerChanged) session.current?.controller.ownerChanged();
  });

  const recording = state.phase === "recording";
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- wall-clock timer only while recording
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  return {
    state,
    available: input.enabled && typeof MediaRecorder !== "undefined",
    elapsedSeconds: Math.max(0, Math.floor((now - recordingStartedAt) / 1000)),
    level: () => session.current?.recorder.level() ?? 0,
    toggle: () => {
      const controller = session.current?.controller;
      if (!controller) return;
      if (controller.currentState.phase === "recording") void controller.stop();
      else void controller.start();
    },
    stop: () => void session.current?.controller.stop(),
    cancel: () => session.current?.controller.cancel(),
  };
}
