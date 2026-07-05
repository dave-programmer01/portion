/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Portion design system
        green: {
          DEFAULT: "#22C55E",
          dark: "#16A34A",
          light: "#DCFCE7",
          surface: "#F0FDF4",
        },
        ink: "#0F172A", // Text Primary
        muted: "#475569", // Text Secondary
        line: "#E2E8F0", // Border
        surface: "#F8FAFC",
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
