"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { GRAT_EN, type GratuityKey } from "@/lib/gratuity-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/** Translator for the gratuity UI: i18n when the key is merged, else the English in `GRAT_EN`. */
export function useGratuityText(): (key: GratuityKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(GRAT_EN[key], vars) : translated;
    },
    [t],
  );
}
