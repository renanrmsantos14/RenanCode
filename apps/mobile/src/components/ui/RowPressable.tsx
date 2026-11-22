import type { ComponentProps, ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useResolveClassNames } from "uniwind";

import { cn } from "../../lib/cn";
import { useHoverGesture } from "../../lib/useHoverGesture";

export function RowPressable({
  children,
  className,
  interactionClassName = "bg-row-hover",
  interactionOpacity = 1,
  ...props
}: Omit<ComponentProps<typeof Pressable>, "children"> & {
  readonly children: ReactNode;
  readonly interactionClassName?: string;
  readonly interactionOpacity?: number;
}) {
  const { hovered, hoverGesture } = useHoverGesture(props.disabled ?? false);
  const rippleStyle = useResolveClassNames("bg-subtle-strong");
  return (
    <GestureDetector gesture={hoverGesture}>
      <Pressable
        // Touch never hovers, so a finger needs the ripple. The delay keeps a scroll from flashing it.
        android_ripple={{ color: rippleStyle.backgroundColor }}
        unstable_pressDelay={Platform.OS === "android" ? 50 : undefined}
        {...props}
        className={cn("relative overflow-hidden", className)}
      >
        {() => (
          <>
            <View
              pointerEvents="none"
              className={cn("absolute inset-0", interactionClassName)}
              style={{ opacity: props.disabled || !hovered ? 0 : interactionOpacity }}
            />
            {children}
          </>
        )}
      </Pressable>
    </GestureDetector>
  );
}
