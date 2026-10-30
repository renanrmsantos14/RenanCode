import {
  MASCOT_GESTURES,
  MASCOT_MANIFEST,
  type MascotGesture,
  type MascotSprite,
  type MascotState,
} from "@t3tools/client-runtime/mascot";
import type { CSSProperties } from "react";

import { cn } from "../../lib/utils";
import { MASCOT_GESTURE_URLS, MASCOT_URLS } from "./mascotAssets";
import { useMascotGesture } from "./useMascotGesture";

function spriteStyle(sprite: MascotSprite, url: string, size: number): CSSProperties {
  const restFrame = sprite.mode === "loop" ? 0 : sprite.frames - 1;
  const steps = sprite.mode === "loop" ? sprite.frames : sprite.frames - 1;
  return {
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
}

export function Mascot(props: {
  readonly state: MascotState;
  readonly size?: number;
  readonly className?: string;
}) {
  const { gesture, endGesture } = useMascotGesture(props.state);
  const sprite = MASCOT_MANIFEST[props.state];
  const size = props.size ?? 32;
  // The state strip stays mounted under the gesture so a "once" state does not replay afterwards.
  return (
    <div
      aria-hidden
      className={cn("relative shrink-0", props.className)}
      style={{ width: size, height: size }}
    >
      <div
        key={props.state}
        data-mode={sprite.mode}
        className={cn("mascot-sprite", gesture !== null && "invisible")}
        style={spriteStyle(sprite, MASCOT_URLS[props.state], size)}
      />
      {gesture !== null ? (
        <MascotGestureSprite gesture={gesture} size={size} onEnd={endGesture} />
      ) : null}
    </div>
  );
}

function MascotGestureSprite(props: {
  readonly gesture: MascotGesture;
  readonly size: number;
  readonly onEnd: () => void;
}) {
  const sprite = MASCOT_GESTURES[props.gesture];
  return (
    <div
      key={props.gesture}
      data-mode={sprite.mode}
      className="mascot-sprite absolute inset-0"
      style={spriteStyle(sprite, MASCOT_GESTURE_URLS[props.gesture], props.size)}
      onAnimationEnd={props.onEnd}
    />
  );
}
