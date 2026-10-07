"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { RET_EN, type RetKey } from "@/lib/retirement-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the retirement simulator. The `ret_*` keys are typed locally (`RetKey`) so the feature does
 * not depend on the keys being in `lib/i18n.ts`'s `TranslationKey` union yet: the cast below is the only place
 * that bridges the two. When the i18n files do not know a key, `t()` returns the key itself; then the English
 * text is used.
 */
export function useRetirementText(): (key: RetKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(RET_EN[key], vars) : translated;
    },
    [t],
  );
}

/** The translated name of an asset category, falling back to the raw name when no key exists. */
export function useCategoryName(): (category: string) => string {
  const { t } = useLanguage();
  return useCallback(
    (category) => {
      const key = `category_${category.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
      const translated = t(key as unknown as TranslationKey);
      return translated === key ? category : translated;
    },
    [t],
  );
}
