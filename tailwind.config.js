/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Portion design system.
        // Brand greens stay fixed across light/dark; the neutral tokens below
        // resolve to CSS variables that flip with the system color scheme
        // (see global.css), so classNames adapt with no per-component changes.
        green: {
          DEFAULT: "#22C55E",
          dark: "#16A34A",
          light: "#DCFCE7",
          // Selected/accent fill — adapts to a dark green tint in dark mode so
          // selected chips/cards aren't bright white boxes. Only ever a bg.
          surface: "rgb(var(--color-green-surface) / <alpha-value>)",
        },
        bg: "rgb(var(--color-bg) / <alpha-value>)", // screen background
        card: "rgb(var(--color-card) / <alpha-value>)", // cards / inputs
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)", // Text Primary
        muted: "rgb(var(--color-muted) / <alpha-value>)", // Text Secondary
        faint: "rgb(var(--color-faint) / <alpha-value>)", // inactive icons
        line: "rgb(var(--color-line) / <alpha-value>)", // Border
        // Semantic colors
        success: "#22C55E",
        warning: "#F59E0B",
        error: "#EF4444",
        info: "#3882F6", // Carbs blue from design system
      },
      fontFamily: {
        regular: ["Inter_400Regular"],
        medium: ["Inter_500Medium"],
        semibold: ["Inter_600SemiBold"],
        bold: ["Inter_700Bold"],
      },
    },
  },
  plugins: [],
};
