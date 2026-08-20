import type { ComponentProps } from "react";
import { Platform, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

/**
 * Cross-platform icon. SF Symbols are Apple-only, so on iOS we render the native
 * `SymbolView`, and everywhere else (Android / web) we render the closest
 * Material Community Icon via the map below. This is a drop-in replacement for
 * `SymbolView` — the app passes SF Symbol names and this handles the rest.
 */

type MdiName = ComponentProps<typeof MaterialCommunityIcons>["name"];

// SF Symbol → Material Community Icon. Unmapped names fall back to a neutral dot.
const MAP: Record<string, MdiName> = {
  // navigation / chrome
  "chevron.down": "chevron-down",
  "chevron.left": "chevron-left",
  "chevron.right": "chevron-right",
  xmark: "close",
  "xmark.circle.fill": "close-circle",
  plus: "plus",
  "plus.circle.fill": "plus-circle",
  minus: "minus",
  checkmark: "check",
  "checkmark.circle.fill": "check-circle",
  "checkmark.seal.fill": "check-decagram",
  "checkmark.shield": "shield-check",
  "checkmark.square.fill": "checkbox-marked",
  circle: "checkbox-blank-circle-outline",
  "info.circle": "information-outline",
  "questionmark.circle": "help-circle-outline",
  "exclamationmark.triangle": "alert-outline",
  "exclamationmark.triangle.fill": "alert",
  magnifyingglass: "magnify",
  barcode: "barcode",
  gift: "gift-outline",
  "gift.fill": "gift",
  trash: "trash-can-outline",
  "square.and.pencil": "square-edit-outline",
  "square.and.arrow.up": "export-variant",
  pencil: "pencil",
  "rectangle.portrait.and.arrow.right": "logout",
  "doc.text": "file-document-outline",
  message: "message-outline",
  globe: "web",
  moon: "weather-night",
  ruler: "ruler",
  bell: "bell-outline",
  "bell.fill": "bell",
  calendar: "calendar",
  clock: "clock-outline",
  "clock.arrow.circlepath": "history",
  target: "target",
  star: "star-outline",
  "star.fill": "star",
  crown: "crown",
  "crown.fill": "crown",
  "wand.and.stars": "auto-fix",
  sparkles: "auto-fix",
  "lightbulb.fill": "lightbulb-on",
  "wifi.slash": "wifi-off",
  "gearshape.fill": "cog",
  "gearshape.2.fill": "cogs",
  "bolt.fill": "lightning-bolt",
  "bolt.horizontal.fill": "flash",
  // media controls
  "play.fill": "play",
  "play.circle.fill": "play-circle",
  "backward.end.fill": "skip-previous",
  "forward.end.fill": "skip-next",
  "arrow.clockwise": "refresh",
  "arrow.uturn.backward": "undo-variant",
  "arrow.triangle.2.circlepath": "sync",
  // people / account
  person: "account-outline",
  "person.fill": "account",
  "apple.logo": "apple",
  "heart.text.square": "heart-pulse",
  "figure.and.child.holdinghands": "human-male-child",
  // food / nutrition
  "fork.knife": "silverware-fork-knife",
  "camera.fill": "camera",
  "barcode.viewfinder": "barcode-scan",
  flame: "fire",
  "flame.fill": "fire",
  scalemass: "scale-bathroom",
  // charts / house
  "chart.bar": "chart-bar",
  "chart.bar.fill": "chart-bar",
  house: "home-outline",
  "house.fill": "home",
  // fitness
  dumbbell: "dumbbell",
  "dumbbell.fill": "dumbbell",
  "figure.walk": "walk",
  "figure.mixed.cardio": "run-fast",
  "figure.rower": "rowing",
  "figure.arms.open": "arm-flex",
  "figure.core.training": "yoga",
  "figure.strengthtraining.functional": "weight-lifter",
  "figure.strengthtraining.traditional": "dumbbell",
  "rectangle.fill": "sofa-outline",
};

export type IconProps = {
  name: string;
  size?: number;
  tintColor?: string;
  color?: string;
  weight?: SymbolViewProps["weight"];
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 20, tintColor, color, weight, style }: IconProps) {
  const tint = tintColor ?? color;
  if (Platform.OS === "ios") {
    return (
      <SymbolView
        name={name as SymbolViewProps["name"]}
        size={size}
        tintColor={tint}
        weight={weight}
        style={style as SymbolViewProps["style"]}
      />
    );
  }
  return (
    <MaterialCommunityIcons
      name={MAP[name] ?? "checkbox-blank-circle-outline"}
      size={size}
      color={tint ?? "#111827"}
      style={style as StyleProp<TextStyle>}
    />
  );
}
