import { useState } from "react";
import { Pressable } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";

const MASK = "••••••@••••••";

/** An account label that hides email addresses until tapped. */
export function MaskedAccountLabel(props: {
  readonly value: string;
  readonly className: string;
  readonly prefix?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const prefix = props.prefix ?? "";
  if (!props.value.includes("@")) {
    return (
      <Text className={props.className} numberOfLines={1}>
        {prefix}
        {props.value}
      </Text>
    );
  }
  return (
    <Pressable
      className="shrink active:opacity-60"
      accessibilityRole="button"
      accessibilityLabel={revealed ? "Hide account label" : "Reveal account label"}
      onPress={() => setRevealed((current) => !current)}
    >
      <Text className={props.className} numberOfLines={1}>
        {prefix}
        {revealed ? props.value : MASK}
      </Text>
    </Pressable>
  );
}
