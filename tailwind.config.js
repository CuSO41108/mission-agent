/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 黑曜石背景层
        obsidian: {
          950: "rgb(var(--obsidian-950) / <alpha-value>)",
          900: "rgb(var(--obsidian-900) / <alpha-value>)",
          850: "rgb(var(--obsidian-850) / <alpha-value>)",
          800: "rgb(var(--obsidian-800) / <alpha-value>)",
          700: "rgb(var(--obsidian-700) / <alpha-value>)",
          600: "rgb(var(--obsidian-600) / <alpha-value>)",
        },
        // 文本层级
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
          faint: "rgb(var(--ink-faint) / <alpha-value>)",
        },
        // 主强调：磷光青（CRT 磷光）
        phosphor: {
          50: "rgb(var(--phosphor-50) / <alpha-value>)",
          100: "rgb(var(--phosphor-100) / <alpha-value>)",
          200: "rgb(var(--phosphor-200) / <alpha-value>)",
          300: "rgb(var(--phosphor-300) / <alpha-value>)",
          400: "rgb(var(--phosphor-400) / <alpha-value>)",
          500: "rgb(var(--phosphor-500) / <alpha-value>)",
          600: "rgb(var(--phosphor-600) / <alpha-value>)",
          700: "rgb(var(--phosphor-700) / <alpha-value>)",
          800: "rgb(var(--phosphor-800) / <alpha-value>)",
          900: "rgb(var(--phosphor-900) / <alpha-value>)",
        },
        // 次强调：暖琥珀（截止/警告）
        amber: {
          400: "rgb(var(--amber-400) / <alpha-value>)",
          500: "rgb(var(--amber-500) / <alpha-value>)",
          600: "rgb(var(--amber-600) / <alpha-value>)",
        },
        // 状态色
        jade: "rgb(var(--jade) / <alpha-value>)",
        coral: "rgb(var(--coral) / <alpha-value>)",
        violet: "rgb(var(--violet) / <alpha-value>)",
      },
      fontFamily: {
        display: ['"Chakra Petch"', "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        xs: "2px",
        sm: "3px",
        DEFAULT: "4px",
      },
      boxShadow: {
        "glow-phosphor": "0 0 0 1px rgba(0,229,212,0.25), 0 0 24px -8px rgba(0,229,212,0.45)",
        "glow-amber": "0 0 0 1px rgba(255,181,71,0.25), 0 0 24px -8px rgba(255,181,71,0.35)",
        "glow-coral": "0 0 0 1px rgba(255,107,107,0.3), 0 0 24px -8px rgba(255,107,107,0.4)",
        panel: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)",
        "scanline":
          "repeating-linear-gradient(0deg, rgba(0,229,212,0.025) 0px, rgba(0,229,212,0.025) 1px, transparent 1px, transparent 3px)",
        "noise":
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.015) 1px, transparent 0)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.85)" },
        },
        "scan-y": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        "flicker": {
          "0%, 100%": { opacity: "1" },
          "92%": { opacity: "1" },
          "93%": { opacity: "0.6" },
          "94%": { opacity: "1" },
          "96%": { opacity: "0.8" },
          "97%": { opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
        "scan-y": "scan-y 3s linear infinite",
        "flicker": "flicker 6s linear infinite",
        "shimmer": "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};
