import { View, StyleSheet, type ViewStyle } from "react-native";

type ProgressRingProps = {
  /** Diameter of the ring in px. */
  size?: number;
  /** Thickness of the ring stroke in px. */
  strokeWidth?: number;
  /** Progress 0..1. */
  progress?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
};

/**
 * Circular progress ring drawn with plain Views (no react-native-svg, which
 * would require a native rebuild). Uses the classic two-half rotating-mask
 * technique: each half of the circle is clipped and a colored ring is rotated
 * inside it to reveal an arc.
 */
export function ProgressRing({
  size = 132,
  strokeWidth = 12,
  progress = 0,
  color = "#22C55E",
  trackColor = "#EAEFF4",
  children,
}: ProgressRingProps) {
  const radius = size / 2;
  const clamped = Math.max(0, Math.min(1, progress));
  const deg = clamped * 360;

  // Right half draws the first 0-180°, left half draws 180-360°.
  const firstHalfDeg = Math.min(deg, 180);
  const secondHalfDeg = deg > 180 ? deg - 180 : 0;

  const baseRing: ViewStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    borderWidth: strokeWidth,
    position: "absolute",
  };

  return (
    <View style={{ width: size, height: size }}>
      {/* Ring layers, rotated so the filled arc is centered at the top and the
          unfilled gap sits centered at the bottom (gauge style). */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate: `${90 - deg / 2}deg` }] },
        ]}
      >
        {/* Track */}
        <View style={[baseRing, { borderColor: trackColor }]} />

        {/* Right half: reveals first 180° */}
        <View
          style={[styles.clip, { width: radius, height: size, left: radius }]}
        >
          <View
            style={[
              baseRing,
              {
                left: -radius,
                borderColor: color,
                borderLeftColor: "transparent",
                borderBottomColor: "transparent",
                transform: [{ rotate: `${-135 + firstHalfDeg}deg` }],
              },
            ]}
          />
        </View>

        {/* Left half: reveals second 180° */}
        <View style={[styles.clip, { width: radius, height: size, left: 0 }]}>
          <View
            style={[
              baseRing,
              {
                left: 0,
                borderColor: color,
                borderRightColor: "transparent",
                borderTopColor: "transparent",
                transform: [{ rotate: `${45 + secondHalfDeg}deg` }],
              },
            ]}
          />
        </View>
      </View>

      {/* Center content — kept upright, outside the rotated layers. */}
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
});
