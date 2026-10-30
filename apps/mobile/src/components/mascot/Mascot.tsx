import { MASCOT_MANIFEST, type MascotState } from "@t3tools/client-runtime/mascot";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { MASCOT_SOURCES } from "./mascotAssets";

export function Mascot(props: { readonly state: MascotState; readonly size?: number }) {
  const reduceMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);
  const [shownState, setShownState] = useState(props.state);
  if (shownState !== props.state) {
    setShownState(props.state);
    setFrame(0);
  }
  const sprite = props.state === "idle" ? null : MASCOT_MANIFEST[props.state];
  const lastFrame = sprite ? sprite.frames - 1 : 0;
  const animating =
    sprite !== null && !reduceMotion && (sprite.mode === "loop" || frame < lastFrame);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- frame timer runs only while a strip plays
  useEffect(() => {
    if (!animating || sprite === null) return;
    const timer = setInterval(
      () =>
        setFrame((current) =>
          sprite.mode === "loop" ? (current + 1) % sprite.frames : current + 1,
        ),
      1000 / sprite.fps,
    );
    return () => clearInterval(timer);
  }, [animating, sprite]);
  if (props.state === "idle" || sprite === null) return null;
  const size = props.size ?? 32;
  const shown = reduceMotion
    ? sprite.mode === "loop"
      ? 0
      : lastFrame
    : Math.min(frame, lastFrame);
  return (
    <View accessible={false} style={{ width: size, height: size, overflow: "hidden" }}>
      <Image
        source={MASCOT_SOURCES[props.state]}
        style={{
          width: size * sprite.frames,
          height: size,
          transform: [{ translateX: -shown * size }],
        }}
        resizeMode="stretch"
      />
    </View>
  );
}
