import type { VoiceRecorder, VoiceRecorderStatus } from "@t3tools/client-runtime/voice-input";

export type WebVoiceRecorder = VoiceRecorder & {
  /** Current loudness from 0 to 1. */
  readonly level: () => number;
  readonly release: () => void;
};

export function createWebVoiceRecorder(
  onStatus: (status: VoiceRecorderStatus) => void,
): WebVoiceRecorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let limitTimer: ReturnType<typeof setTimeout> | null = null;
  let uri: string | null = null;
  const chunks: Blob[] = [];

  const stopTracks = () => {
    stream?.getTracks().forEach((track) => track.stop());
    void audioContext?.close();
    stream = null;
    audioContext = null;
    analyser = null;
  };

  const finish = () =>
    new Promise<void>((resolve) => {
      const active = recorder;
      if (!active || active.state === "inactive") {
        stopTracks();
        resolve();
        return;
      }
      active.addEventListener(
        "stop",
        () => {
          uri = URL.createObjectURL(new Blob(chunks, { type: active.mimeType }));
          stopTracks();
          resolve();
        },
        { once: true },
      );
      active.stop();
    });

  return {
    get uri() {
      return uri;
    },
    async prepareToRecordAsync() {
      chunks.length = 0;
      uri = null;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.addEventListener("dataavailable", (event) => chunks.push(event.data));
      recorder.addEventListener("error", () =>
        onStatus({
          isFinished: false,
          hasError: true,
          error: "Microphone recording failed.",
          url: null,
        }),
      );
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      audioContext.createMediaStreamSource(stream).connect(analyser);
    },
    record({ forDuration }) {
      recorder?.start(1000);
      limitTimer = setTimeout(() => {
        void finish().then(() =>
          onStatus({ isFinished: true, hasError: false, error: null, url: uri }),
        );
      }, forDuration * 1000);
    },
    async stop() {
      if (limitTimer) clearTimeout(limitTimer);
      await finish();
    },
    level() {
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) sum += ((sample - 128) / 128) ** 2;
      // Normal speech RMS is roughly 0.02-0.1; the curve lifts quiet voices into view.
      return Math.min(1, (Math.sqrt(sum / data.length) / 0.08) ** 0.6);
    },
    release() {
      if (limitTimer) clearTimeout(limitTimer);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopTracks();
    },
  };
}
