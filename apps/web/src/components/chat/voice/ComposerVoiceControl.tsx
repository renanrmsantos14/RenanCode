import { CheckIcon, MicIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "../../ui/button";
import { Spinner } from "../../ui/spinner";
import type { ComposerVoiceInput } from "./useComposerVoiceInput";

const WAVEFORM_BARS = 32;
const SAMPLE_INTERVAL_MS = 70;
const MIN_BAR_SCALE = 0.1;

const formatElapsed = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Scrolling loudness history: the newest sample enters on the right. */
function VoiceWaveform({ level }: { readonly level: () => number }) {
  const bars = useRef<Array<HTMLSpanElement | null>>([]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- samples the microphone analyser outside React state
  useEffect(() => {
    const history = Array<number>(WAVEFORM_BARS).fill(0);
    let smoothed = 0;
    const timer = setInterval(() => {
      const next = level();
      smoothed = next > smoothed ? next : smoothed * 0.6 + next * 0.4;
      history.shift();
      history.push(smoothed);
      history.forEach((value, index) => {
        const bar = bars.current[index];
        if (!bar) return;
        bar.style.transform = `scaleY(${Math.max(MIN_BAR_SCALE, value)})`;
        bar.style.opacity = String(0.35 + 0.65 * Math.min(1, value * 1.6));
      });
    }, SAMPLE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [level]);
  return (
    <span aria-hidden className="flex h-5 shrink items-center justify-end gap-0.5 overflow-hidden">
      {Array.from({ length: WAVEFORM_BARS }, (_, index) => (
        <span
          key={index}
          ref={(node) => {
            bars.current[index] = node;
          }}
          className="h-full w-[3px] shrink-0 origin-center scale-y-[0.1] rounded-full bg-foreground opacity-35 transition-transform duration-75 ease-out"
        />
      ))}
    </span>
  );
}

export function ComposerVoiceControl({ voice }: { readonly voice: ComposerVoiceInput }) {
  const { phase, error } = voice.state;

  if (phase === "recording") {
    return (
      <div
        role="status"
        aria-label="Recording dictation"
        className="flex h-8 min-w-0 items-center gap-2 rounded-full border border-border bg-muted/50 ps-3 pe-1"
      >
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-destructive" />
        <VoiceWaveform level={voice.level} />
        <span className="w-9 shrink-0 text-end text-xs tabular-nums text-muted-foreground">
          {formatElapsed(voice.elapsedSeconds)}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel dictation" onClick={voice.cancel}>
          <XIcon />
        </Button>
        <Button variant="default" size="icon-sm" aria-label="Finish dictation" onClick={voice.stop}>
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
