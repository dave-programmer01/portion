import { useColorScheme } from "nativewind";

/**
 * Imperative color palette for places className tokens can't reach — SF Symbol
 * `tintColor`, `ProgressRing` colors, shadows, `ActivityIndicator`, native tab
 * bar colors. Values mirror the CSS variables in global.css so the two systems
 * stay in sync. Defaults to the system scheme (NativeWind `useColorScheme`).
 */

export type ThemeColors = {
  bg: string;
  card: string;
  surface: string;
  ink: string;
  muted: string;
  faint: string;
  line: string;
  ringTrack: string;
  green: string;
  greenDark: string;
  white: string;
};

const light: ThemeColors = {
  bg: "#FFFFFF",
  card: "#FFFFFF",
  surface: "#F8FAFC",
  ink: "#0F172A",
  muted: "#475569",
  faint: "#94A3B8",
  line: "#E2E8F0",
  ringTrack: "#EAEFF4",
  // Brand / accents (identical in both themes)
  green: "#22C55E",
  greenDark: "#16A34A",
  white: "#FFFFFF",
};

const dark: ThemeColors = {
  bg: "#0B1120",
  card: "#111A2B",
  surface: "#172033",
  ink: "#F1F5F9",
  muted: "#94A3B8",
  faint: "#64748B",
  line: "#24314A",
  ringTrack: "#24314A",
  green: "#22C55E",
  greenDark: "#16A34A",
  white: "#FFFFFF",
};

/** Current palette for the active (system) color scheme. */
export function useThemeColors(): ThemeColors {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? dark : light;
}

/** Whether dark mode is active — handy for one-off branch decisions. */
export function useIsDark(): boolean {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark";
}
