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
          950: "#070A0F",
          900: "#0A0E14",
          850: "#0F141C",
          800: "#131922",
          700: "#1A212C",
          600: "#222B38",
        },
        // 文本层级
        ink: {
          DEFAULT: "#E6EDF3",
          muted: "#8B98A5",
          faint: "#5C6773",
        },
        // 主强调：磷光青（CRT 磷光）
        phosphor: {
          50: "#E6FFFB",
          100: "#B3FFF5",
          200: "#80FFEC",
          300: "#4DFFE2",
          400: "#00E5D4",
          500: "#00C7B8",
          600: "#00A89B",
          700: "#008A80",
          800: "#006B64",
          900: "#004D48",
        },
        // 次强调：暖琥珀（截止/警告）
        amber: {
          400: "#FFCE6B",
          500: "#FFB547",
          600: "#E89A2A",
        },
        // 状态色
        jade: "#7FD1B9",
        coral: "#FF6B6B",
        violet: "#9D8CFF",
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
