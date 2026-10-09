"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { BANKING_EN, type BankingKey } from "@/lib/banking-brokerage-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the stale-balance marker and the Brokerage page. While i18n does not know a key `t()`
 * returns the key itself and the English text from `BANKING_EN` is used instead.
 */
export function useBankingText(): (key: BankingKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(BANKING_EN[key], vars) : translated;
    },
    [t],
  );
}
