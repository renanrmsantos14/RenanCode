import type { VoiceRecorder, VoiceRecorderStatus } from "@t3tools/client-runtime/voice-input";

export const VOICE_WAVEFORM_BARS = 24;
const SILENT_LEVELS: ReadonlyArray<number> = Array<number>(VOICE_WAVEFORM_BARS).fill(0);

export type WebVoiceRecorder = VoiceRecorder & {
  readonly levels: () => ReadonlyArray<number>;
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
      analyser.fftSize = 64;
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
    levels() {
      if (!analyser) return SILENT_LEVELS;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      return Array.from({ length: VOICE_WAVEFORM_BARS }, (_, index) => (data[index] ?? 0) / 255);
    },
    release() {
      if (limitTimer) clearTimeout(limitTimer);
      if (recorder && recorder.state !== "inactive") recorder.stop();
      stopTracks();
    },
  };
}
