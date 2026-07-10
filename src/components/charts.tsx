import { useState } from "react";
import { View, Text, type LayoutChangeEvent } from "react-native";

import { useThemeColors } from "../lib/theme";

/**
 * Lightweight, dependency-free charts (no react-native-svg → no native
 * rebuild). BarChart for calorie history vs. target; LineChart for the weight
 * trend, drawn as dots joined by thin rotated View segments.
 */

export function BarChart({
  data,
  target,
  height = 140,
  color = "#22C55E",
}: {
  data: { label: string; value: number }[];
  target?: number | null;
  height?: number;
  color?: string;
}) {
  const colors = useThemeColors();
  const max = Math.max(1, target ?? 0, ...data.map((d) => d.value));
  const plotH = height - 20; // leave room for labels

  return (
    <View style={{ height }}>
      <View style={{ height: plotH, flexDirection: "row", alignItems: "flex-end" }}>
        {/* Target line */}
        {target ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: (target / max) * plotH,
              height: 1,
              backgroundColor: colors.line,
            }}
          />
        ) : null}
        {data.map((d, i) => {
          const over = target ? d.value > target * 1.05 : false;
          return (
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <View
                style={{
                  width: "62%",
                  height: Math.max(2, (d.value / max) * plotH),
                  borderRadius: 4,
                  backgroundColor: d.value === 0 ? colors.line : over ? "#F59E0B" : color,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {data.map((d, i) => (
          <Text
            key={i}
            numberOfLines={1}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 10,
              color: colors.faint,
              fontFamily: "Inter_500Medium",
            }}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function LineChart({
  data,
  height = 160,
  color = "#22C55E",
}: {
  /** Ordered points; nulls are skipped so gaps don't distort the line. */
  data: number[];
  height?: number;
  color?: string;
}) {
  const colors = useThemeColors();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const pad = 12;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const n = data.length;

  const point = (i: number) => {
    const x = n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - 2 * pad);
    const y = pad + (1 - (data[i] - min) / span) * (height - 2 * pad);
    return { x, y };
  };

  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 && n > 0 ? (
        <>
          {/* Segments */}
          {data.slice(1).map((_, idx) => {
            const a = point(idx);
            const b = point(idx + 1);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            return (
              <View
                key={idx}
                style={{
                  position: "absolute",
                  left: (a.x + b.x) / 2 - len / 2,
                  top: (a.y + b.y) / 2 - 1.5,
                  width: len,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: color,
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}
          {/* Dots */}
          {data.map((_, i) => {
            const pt = point(i);
            return (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: pt.x - 4,
                  top: pt.y - 4,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: colors.bg,
                  borderWidth: 2,
                  borderColor: color,
                }}
              />
            );
          })}
        </>
      ) : null}
    </View>
  );
}
