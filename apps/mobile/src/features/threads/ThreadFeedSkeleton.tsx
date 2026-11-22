import { StyleSheet, View } from "react-native";
import Animated, { FadeOut } from "react-native-reanimated";

const TURNS = [
  { prompt: "42%", reply: ["94%", "88%", "76%", "45%"] },
  { prompt: "58%", reply: ["92%", "84%", "58%"] },
] as const;

/** Covers the conversation while it loads or the list settles on its end, then fades into it. */
export function ThreadFeedSkeleton(props: {
  readonly backgroundColor: string;
  readonly bottomInset: number;
  readonly paddingLeft: number;
  readonly paddingRight: number;
  readonly reduceMotion: boolean;
  readonly topInset: number;
}) {
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      {...(props.reduceMotion ? {} : { exiting: FadeOut.duration(160) })}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: props.backgroundColor,
          justifyContent: "flex-end",
          overflow: "hidden",
          paddingTop: props.topInset,
          paddingBottom: props.bottomInset + 8,
          paddingLeft: props.paddingLeft,
          paddingRight: props.paddingRight,
        },
      ]}
    >
      {TURNS.map((turn) => (
        <View key={turn.prompt} className="gap-2.5 pt-6">
          <View
            className="mb-3 h-10 self-end rounded-2xl bg-subtle-strong"
            style={{ width: turn.prompt }}
          />
          {turn.reply.map((width) => (
            <View key={width} className="h-3 rounded bg-subtle-strong" style={{ width }} />
          ))}
        </View>
      ))}
    </Animated.View>
  );
}
