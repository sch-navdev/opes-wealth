/**
 * The app's languages, client-safe and dependency-free (the dictionary in
 * `lib/i18n.ts` and the context in `context/language-context.tsx` both build on
 * this).
 *
 * `intl` is the BCP-47 tag handed to `Intl.NumberFormat` / `Intl.DateTimeFormat`
 * so numbers, currencies and dates follow each language's conventions
 * (separators, grouping, symbol placement). Arabic uses the UAE regional
 * variant, which defaults to Western digits (0-9) — the same digits as the
 * rest of the UI and the PDF/Excel exports. Hindi uses the Indian grouping
 * (1,00,000).
 */
export type Locale = "en" | "fr" | "es" | "it" | "de" | "ar" | "ru" | "hi" | "zh";

export type LocaleInfo = {
  code: Locale;
  /** The language's own name (shown in the switcher regardless of the current language). */
  name: string;
  /** Short code shown on the compact switcher button. */
  short: string;
  intl: string;
  dir: "ltr" | "rtl";
};

export const LOCALE_INFO: LocaleInfo[] = [
  { code: "en", name: "English", short: "EN", intl: "en-US", dir: "ltr" },
  { code: "fr", name: "Français", short: "FR", intl: "fr-FR", dir: "ltr" },
  { code: "es", name: "Español", short: "ES", intl: "es-ES", dir: "ltr" },
  { code: "it", name: "Italiano", short: "IT", intl: "it-IT", dir: "ltr" },
  { code: "de", name: "Deutsch", short: "DE", intl: "de-DE", dir: "ltr" },
  { code: "ar", name: "العربية", short: "AR", intl: "ar-AE", dir: "rtl" },
  { code: "ru", name: "Русский", short: "RU", intl: "ru-RU", dir: "ltr" },
  { code: "hi", name: "हिन्दी", short: "HI", intl: "hi-IN", dir: "ltr" },
  { code: "zh", name: "简体中文", short: "ZH", intl: "zh-CN", dir: "ltr" },
];

export const locales: Locale[] = LOCALE_INFO.map((l) => l.code);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function localeInfo(locale: Locale): LocaleInfo {
  return LOCALE_INFO.find((l) => l.code === locale) ?? LOCALE_INFO[0];
}

/** Languages the DCC PDF can be drawn in: jsPDF's built-in fonts only cover Latin scripts. */
export const PDF_LOCALES: Locale[] = ["en", "fr", "es", "it", "de"];
