"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { SCPI2_EN, type Scpi2Key } from "@/lib/scpi-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the SCPI tracking UI. While i18n does not know a key `t()` returns the key itself
 * and the English text from `SCPI2_EN` is used instead.
 */
export function useScpiText(): (key: Scpi2Key, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(SCPI2_EN[key], vars) : translated;
    },
    [t],
  );
}
