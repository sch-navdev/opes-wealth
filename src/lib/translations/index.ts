import type { Locale } from "@/lib/locales";
import { ar } from "./ar";
import { de } from "./de";
import { es } from "./es";
import { hi } from "./hi";
import { it } from "./it";
import { ru } from "./ru";
import { zh } from "./zh";

/**
 * Translations for every language other than English and French (those two
 * live next to their keys in `lib/i18n.ts`). A key missing here falls back to
 * the English text, so a new string never shows a raw key.
 */
export const EXTRA_TRANSLATIONS: Partial<Record<Locale, Record<string, string>>> = {
  es,
  it,
  de,
  ar,
  ru,
  hi,
  zh,
};
