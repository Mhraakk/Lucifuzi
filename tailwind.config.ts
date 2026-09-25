import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        persian: ["var(--font-body)", "Vazirmatn", "Tahoma", "sans-serif"],
        display: ["var(--font-display)", "Amiri", "serif"],
      },
      colors: {
        ink: "var(--ink)",
        muted: "var(--ink-muted)",
        accent: "var(--accent)",
        soft: "var(--bg-soft)",
        elevated: "var(--bg-elevated)",
        line: "var(--line)",
      },
      maxWidth: {
        app: "480px",
        desk: "1120px",
      },
    },
  },
  plugins: [],
};

export default config;
