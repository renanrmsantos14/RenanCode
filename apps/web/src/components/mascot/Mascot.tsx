import { MASCOT_MANIFEST, type MascotState } from "@t3tools/client-runtime/mascot";
import type { CSSProperties } from "react";

import { cn } from "../../lib/utils";
import { MASCOT_URLS } from "./mascotAssets";

export function Mascot(props: {
  readonly state: MascotState;
  readonly size?: number;
  readonly className?: string;
}) {
  if (props.state === "idle") return null;
  const sprite = MASCOT_MANIFEST[props.state];
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
    backgroundImage: `url(${MASCOT_URLS[props.state]})`,
    backgroundSize: `${size * sprite.frames}px ${size}px`,
    backgroundPositionX: -restFrame * size,
  } as CSSProperties;
  return (
    <div
      aria-hidden
      key={props.state}
      data-mode={sprite.mode}
      className={cn("mascot-sprite shrink-0", props.className)}
      style={style}
    />
  );
}
