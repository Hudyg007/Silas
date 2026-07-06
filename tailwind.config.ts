import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-hanken)", "-apple-system", "BlinkMacSystemFont", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "monospace"],
      },
      colors: {
        aurora: {
          base: "#02040f",
          deep: "#080820",
          mid: "#150e28",
          haze: "#0c1830",
        },
        silas: {
          node: "rgba(195,220,245,0.55)",
          bright: "rgba(245,250,255,0.98)",
          bubble: "rgba(8,12,28,0.42)",
          border: "rgba(180,210,255,0.13)",
          text: "rgba(232,240,250,0.96)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
