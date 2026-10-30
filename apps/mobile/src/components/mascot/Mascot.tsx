import { MASCOT_GESTURES, MASCOT_MANIFEST, type MascotState } from "@t3tools/client-runtime/mascot";
import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { MASCOT_GESTURE_SOURCES, MASCOT_SOURCES } from "./mascotAssets";
import { useMascotGesture } from "./useMascotGesture";

export function Mascot(props: { readonly state: MascotState; readonly size?: number }) {
  const reduceMotion = useReducedMotion();
  const { gesture, endGesture } = useMascotGesture(props.state, reduceMotion);
  const shownKey = gesture ?? props.state;
  const [frame, setFrame] = useState(0);
  const [shownState, setShownState] = useState(shownKey);
  const sprite = gesture === null ? MASCOT_MANIFEST[props.state] : MASCOT_GESTURES[gesture];
  if (shownState !== shownKey) {
    // A "once" state already played before its gesture; resume on its last frame instead of replaying.
    const resuming = gesture === null && shownState !== props.state && sprite.mode === "once";
    setShownState(shownKey);
    setFrame(resuming ? sprite.frames - 1 : 0);
  }
  const source = gesture === null ? MASCOT_SOURCES[props.state] : MASCOT_GESTURE_SOURCES[gesture];
  const lastFrame = sprite.frames - 1;
  const animating = !reduceMotion && (sprite.mode === "loop" || frame < lastFrame);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- frame timer runs only while a strip plays
  useEffect(() => {
    if (!animating) return;
    const timer = setInterval(
      () =>
        setFrame((current) =>
          sprite.mode === "loop" ? (current + 1) % sprite.frames : current + 1,
        ),
      1000 / sprite.fps,
    );
    return () => clearInterval(timer);
  }, [animating, sprite]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the gesture strip hands control back to the state loop after its last frame is shown
  useEffect(() => {
    if (gesture === null || frame < lastFrame) return;
    const timer = setTimeout(endGesture, 1000 / sprite.fps);
    return () => clearTimeout(timer);
  }, [endGesture, frame, gesture, lastFrame, sprite.fps]);
  const size = props.size ?? 32;
  const shown = reduceMotion
    ? sprite.mode === "loop"
      ? 0
      : lastFrame
    : Math.min(frame, lastFrame);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, overflow: "hidden" }}
    >
      <Image
        source={source}
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
