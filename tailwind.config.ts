import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#fafaf7",
        panel: "#ffffff",
        "panel-2": "#f3f2ee",
        ink: "#1a1a1a",
        "ink-2": "#3f3f46",
        muted: "#6b6b6b",
        faint: "#a1a1aa",
        line: "#e6e4dd",
        amber: {
          DEFAULT: "#b45309",
          soft: "rgba(180,83,9,0.08)",
          border: "rgba(180,83,9,0.3)",
          glow: "#d97706",
        },
        green: { DEFAULT: "#15803d", soft: "rgba(21,128,61,0.08)" },
        red: { DEFAULT: "#b91c1c", soft: "rgba(185,28,28,0.08)" },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Inter", "system-ui", "sans-serif"],
        mono: ["SF Mono", "Menlo", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
