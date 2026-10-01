"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { translate, type TranslationKey } from "@/lib/i18n";
import { isLocale, localeInfo, type Locale } from "@/lib/locales";

const STORAGE_KEY = "opes_locale";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** BCP-47 tag for `Intl.*` formatters (numbers, currencies, dates) in the current language. */
  intlLocale: string;
  /** Text direction of the current language (Arabic is right-to-left). */
  dir: "ltr" | "rtl";
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : "en";
  } catch {
    return "en";
  }
}

/** The server (and the client's very first paint) always renders "en" — the real value, if different, is only knowable after mount, once `localStorage` exists. */
function getServerSnapshot(): Locale {
  return "en";
}

function writeLocale(next: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore write failures
  }
  listeners.forEach((listener) => listener());
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((next: Locale) => writeLocale(next), []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  const info = localeInfo(locale);

  // Reflect the language on <html> so the browser, screen readers and CSS (logical properties, `rtl:`) follow it.
  useEffect(() => {
    document.documentElement.lang = info.code;
    document.documentElement.dir = info.dir;
  }, [info.code, info.dir]);

  const value = useMemo(
    () => ({ locale, setLocale, intlLocale: info.intl, dir: info.dir, t }),
    [locale, setLocale, info.intl, info.dir, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
