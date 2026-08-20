import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useThemeColors } from "../lib/theme";

/**
 * Skeleton placeholder — a softly pulsing block used to sketch a screen's layout
 * while its data loads. Showing the shape of what's coming reads as "almost
 * here" and holds attention far better than a bare spinner. Theme-aware; the
 * pulse runs on the native driver so it stays smooth during data fetches.
 */

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: SkeletonProps) {
  const colors = useThemeColors();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.line,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/** Convenience for round placeholders (avatars, the calorie ring, etc.). */
export function SkeletonCircle({
  size,
  style,
}: {
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <Skeleton width={size} height={size} radius={size / 2} style={style} />;
}
