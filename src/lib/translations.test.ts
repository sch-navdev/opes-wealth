import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { translate, type TranslationKey } from "@/lib/i18n";
import { LOCALE_INFO, isLocale, localeInfo, locales, type Locale } from "@/lib/locales";
import { EXTRA_TRANSLATIONS } from "@/lib/translations";
import { ar } from "@/lib/translations/ar";
import { de } from "@/lib/translations/de";
import { es } from "@/lib/translations/es";
import { hi } from "@/lib/translations/hi";
import { it as itTranslations } from "@/lib/translations/it";
import { ru } from "@/lib/translations/ru";
import { zh } from "@/lib/translations/zh";

/**
 * Architecture (src/lib/i18n.ts): English and French live next to their keys in the `dictionary`
 * object (each entry is { en, fr }). The other seven languages live in src/lib/translations/*.ts and
 * are OPTIONAL overlays: `translate()` falls back to the English text for a key a language lacks.
 * Therefore:
 *   - parity (every base key present) is NOT required for the seven languages — missing counts are
 *     reported, not failed;
 *   - a translation key that does not exist in the base dictionary IS an error (dead / typo'd key);
 *   - en and fr must be complete for every key.
 * `dictionary` is not exported, so it is evaluated from the source text of i18n.ts (it is a plain
 * object literal of string literals and comments).
 */
type Entry = { en: string; fr: string };

function loadDictionary(): Record<string, Entry> {
  const src = readFileSync(path.resolve(__dirname, "i18n.ts"), "utf8");
  const start = src.indexOf("const dictionary = {");
  const end = src.indexOf("} as const;", start);
  if (start < 0 || end < 0) throw new Error("Could not locate the dictionary literal in i18n.ts");
  const literal = src.slice(start + "const dictionary = ".length, end + 1);
  return vm.runInNewContext(`(${literal})`) as Record<string, Entry>;
}

const dictionary = loadDictionary();
const baseKeys = Object.keys(dictionary);

const translations: Record<string, Record<string, string>> = { es, it: itTranslations, de, ar, ru, hi, zh };
const extraLocales = Object.keys(translations);

/** `{name}` style and printf style (`%s`, `%d`, `%1$s`) placeholders, as a sorted unique list. */
function placeholders(text: string): string[] {
  const found = text.match(/\{[A-Za-z_][A-Za-z0-9_]*\}|%(?:\d+\$)?[sdif]/g) ?? [];
  return Array.from(new Set(found)).sort();
}

describe("dictionary loading", () => {
  it("finds a large base dictionary", () => {
    expect(baseKeys.length).toBeGreaterThan(1000);
  });

  it("every base entry has non-empty English and French strings", () => {
    const bad = baseKeys.filter((k) => {
      const e = dictionary[k];
      return typeof e?.en !== "string" || typeof e?.fr !== "string" || e.en.trim() === "" || e.fr.trim() === "";
    });
    expect(bad).toEqual([]);
  });

  it("English and French use the same placeholders", () => {
    const mismatched = baseKeys.filter((k) => placeholders(dictionary[k].en).join() !== placeholders(dictionary[k].fr).join());
    expect(mismatched).toEqual([]);
  });
});

describe("language layering", () => {
  it("registers exactly the seven overlay languages", () => {
    expect(Object.keys(EXTRA_TRANSLATIONS).sort()).toEqual([...extraLocales].sort());
    for (const code of extraLocales) expect(EXTRA_TRANSLATIONS[code as Locale]).toBe(translations[code]);
  });

  it("every overlay language is a known locale, and en/fr (built in) are not overlays", () => {
    for (const code of extraLocales) expect(isLocale(code)).toBe(true);
    expect(EXTRA_TRANSLATIONS.en).toBeUndefined();
    expect(EXTRA_TRANSLATIONS.fr).toBeUndefined();
    expect([...locales].sort()).toEqual(["en", "fr", ...extraLocales].sort());
  });

  it("locale metadata is consistent (unique codes, Arabic is the only RTL language)", () => {
    expect(new Set(LOCALE_INFO.map((l) => l.code)).size).toBe(LOCALE_INFO.length);
    expect(LOCALE_INFO.filter((l) => l.dir === "rtl").map((l) => l.code)).toEqual(["ar"]);
    expect(localeInfo("hi").intl).toBe("hi-IN");
  });
});

describe("translate()", () => {
  it("returns English and French from the base dictionary", () => {
    expect(translate("en", "cancel")).toBe("Cancel");
    expect(translate("fr", "cancel")).toBe("Annuler");
  });

  it("returns the overlay text when a language has the key", () => {
    expect(translate("de", "cancel")).toBe(de.cancel);
    expect(translate("zh", "cancel")).toBe(zh.cancel);
  });

  it("falls back to English when an overlay language lacks the key", () => {
    const missing = baseKeys.find((k) => !(k in ru));
    if (!missing) return; // fully translated: nothing to fall back from
    expect(translate("ru", missing as TranslationKey)).toBe(dictionary[missing].en);
  });

  it("returns the raw key for an unknown key", () => {
    expect(translate("en", "definitely_not_a_key" as TranslationKey)).toBe("definitely_not_a_key");
    expect(translate("de", "definitely_not_a_key" as TranslationKey)).toBe("definitely_not_a_key");
  });

  it("interpolates {vars} (numbers and strings) in every language", () => {
    expect(translate("en", "selected_count", { n: 3 })).toBe("3 selected");
    expect(translate("fr", "selected_count", { n: 3 })).toBe("3 sélectionné(s)");
    expect(translate("en", "breakdown_desc", { currency: "AED" })).toBe("Per-asset contribution, in AED.");
    expect(translate("de", "selected_count", { n: 7 })).not.toContain("{n}");
  });

  it("leaves unmatched placeholders untouched and ignores unused variables", () => {
    expect(translate("en", "selected_count")).toBe("{n} selected");
    expect(translate("en", "selected_count", { nope: 1 })).toBe("{n} selected");
  });
});

describe.each(extraLocales)("%s translations", (code) => {
  const t = translations[code];
  const keys = Object.keys(t);
  const baseSet = new Set(baseKeys);

  it("reports coverage against the base dictionary (missing keys fall back to English)", () => {
    const missing = baseKeys.filter((k) => !(k in t));
    const pct = ((baseKeys.length - missing.length) / baseKeys.length) * 100;
    // Reported, not failed: an overlay language need not translate every key.
    console.info(`[i18n] ${code}: ${keys.length} keys, ${missing.length} of ${baseKeys.length} base keys missing (${pct.toFixed(1)}% covered)`);
    expect(keys.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThanOrEqual(baseKeys.length);
  });

  it("has no key that is absent from the base dictionary", () => {
    expect(keys.filter((k) => !baseSet.has(k))).toEqual([]);
  });

  it("has no empty or whitespace-only values", () => {
    expect(keys.filter((k) => typeof t[k] !== "string" || t[k].trim() === "")).toEqual([]);
  });

  it("keeps every interpolation placeholder of the base string", () => {
    const lost: string[] = [];
    for (const k of keys) {
      const base = dictionary[k];
      if (!base || typeof t[k] !== "string") continue;
      for (const ph of placeholders(base.en)) {
        if (!t[k].includes(ph)) lost.push(`${k}: ${ph}`);
      }
    }
    expect(lost).toEqual([]);
  });

  it("does not introduce placeholders that the base string lacks", () => {
    const extra: string[] = [];
    for (const k of keys) {
      const base = dictionary[k];
      if (!base || typeof t[k] !== "string") continue;
      const allowed = new Set(placeholders(base.en));
      for (const ph of placeholders(t[k])) if (!allowed.has(ph)) extra.push(`${k}: ${ph}`);
    }
    expect(extra).toEqual([]);
  });
});
