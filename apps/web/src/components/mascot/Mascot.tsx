import { MASCOT_GESTURES, MASCOT_MANIFEST, type MascotState } from "@t3tools/client-runtime/mascot";
import type { CSSProperties } from "react";

import { cn } from "../../lib/utils";
import { MASCOT_GESTURE_URLS, MASCOT_URLS } from "./mascotAssets";
import { useMascotGesture } from "./useMascotGesture";

export function Mascot(props: {
  readonly state: MascotState;
  readonly size?: number;
  readonly className?: string;
}) {
  const { gesture, endGesture } = useMascotGesture(props.state);
  const sprite = gesture === null ? MASCOT_MANIFEST[props.state] : MASCOT_GESTURES[gesture];
  const url = gesture === null ? MASCOT_URLS[props.state] : MASCOT_GESTURE_URLS[gesture];
  const size = props.size ?? 32;
  const restFrame = sprite.mode === "loop" ? 0 : sprite.frames - 1;
  const steps = sprite.mode === "loop" ? sprite.frames : sprite.frames - 1;
  const style = {
    "--mascot-frames": sprite.frames,
    "--mascot-size": `${size}px`,
    "--mascot-steps": steps,
    "--mascot-duration": `${steps / sprite.fps}s`,
    width: size,
    height: size,
    backgroundImage: `url(${url})`,
    backgroundSize: `${size * sprite.frames}px ${size}px`,
    backgroundPositionX: -restFrame * size,
  } as CSSProperties;
  return (
    <div
      aria-hidden
      key={gesture ?? props.state}
      data-mode={sprite.mode}
      className={cn("mascot-sprite shrink-0", props.className)}
      style={style}
      onAnimationEnd={gesture === null ? undefined : endGesture}
    />
  );
}
