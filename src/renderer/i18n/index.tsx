import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "zh-CN" | "en-US";
export type Theme = "dark" | "light";

interface PreferencesContextValue {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  text: (zh: string, en: string) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const LOCALE_KEY = "mission-console:locale";
// Version the preference so existing HUD-theme installs open in the new light default once.
const THEME_KEY = "mission-console:theme:v2";

function getStoredPreference<T extends string>(key: string, fallback: T, options: readonly T[]): T {
  const value = window.localStorage.getItem(key);
  return value && options.includes(value as T) ? (value as T) : fallback;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() =>
    getStoredPreference(LOCALE_KEY, "zh-CN", ["zh-CN", "en-US"]),
  );
  const [theme, setTheme] = useState<Theme>(() =>
    getStoredPreference(THEME_KEY, "light", ["dark", "light"]),
  );

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const value = useMemo(
    () => ({
      locale,
      theme,
      setLocale,
      setTheme,
      text: (zh: string, en: string) => (locale === "en-US" ? en : zh),
    }),
    [locale, theme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used within PreferencesProvider");
  return context;
}
