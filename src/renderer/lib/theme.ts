const ACCENT_MAP: Record<string, string> = {
  "#00E5D4": "rgb(var(--phosphor-400))",
  "#4DFFE2": "rgb(var(--phosphor-300))",
  "#FFB547": "rgb(var(--amber-500))",
  "#9D8CFF": "rgb(var(--violet))",
  "#7FD1B9": "rgb(var(--jade))",
  "#FF6B6B": "rgb(var(--coral))",
};

/** Resolves stored accent values to the active theme's accessible color token. */
export function themeAccent(color: string) {
  return ACCENT_MAP[color.toUpperCase()] ?? color;
}

export function accentTint(color: string, opacity: number) {
  return `color-mix(in srgb, ${themeAccent(color)} ${Math.round(opacity * 100)}%, transparent)`;
}
