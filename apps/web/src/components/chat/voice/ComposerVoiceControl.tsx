import { CheckIcon, MicIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import type { ComposerVoiceInput } from "./useComposerVoiceInput";
import { VOICE_WAVEFORM_BARS } from "./webVoiceRecorder";

const formatElapsed = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function VoiceWaveform({ levels }: { readonly levels: () => ReadonlyArray<number> }) {
  const bars = useRef<Array<HTMLSpanElement | null>>([]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- samples the microphone analyser outside React state
  useEffect(() => {
    const timer = setInterval(() => {
      const current = levels();
      bars.current.forEach((bar, index) => {
        if (bar) bar.style.transform = `scaleY(${Math.max(0.12, current[index] ?? 0)})`;
      });
    }, 50);
    return () => clearInterval(timer);
  }, [levels]);
  return (
    <span aria-hidden className="flex h-5 items-center gap-px">
      {Array.from({ length: VOICE_WAVEFORM_BARS }, (_, index) => (
        <span
          key={index}
          ref={(node) => {
            bars.current[index] = node;
          }}
          className="h-full w-0.5 origin-center scale-y-[0.12] rounded-full bg-foreground/70"
        />
      ))}
    </span>
  );
}

export function ComposerVoiceControl({ voice }: { readonly voice: ComposerVoiceInput }) {
  const { phase, error } = voice.state;

  if (phase === "recording") {
    return (
      <div className="flex items-center gap-1.5">
        <VoiceWaveform levels={voice.levels} />
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatElapsed(voice.elapsedSeconds)}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel dictation" onClick={voice.cancel}>
          <XIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Finish dictation" onClick={voice.stop}>
          <CheckIcon />
        </Button>
      </div>
    );
  }

  if (phase === "preparing" || phase === "transcribing") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Spinner size="sm" />
        {phase === "transcribing" ? "Transcribing…" : null}
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {phase === "error" && error ? (
        <span role="alert" className="truncate text-xs text-destructive">
          {error}
        </span>
      ) : null}
      {phase === "error" ? (
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={voice.cancel}>
          <XIcon />
        </Button>
      ) : null}
      <Button variant="ghost" size="icon-sm" aria-label="Dictate" onClick={voice.toggle}>
        <MicIcon />
      </Button>
    </div>
  );
}
