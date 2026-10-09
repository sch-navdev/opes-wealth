"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { CF_EN, type CashFlowKey } from "@/lib/cash-flow-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the Personal Cash Flow UI. The `cf_*` keys are typed locally (`CashFlowKey`); the cast
 * is the only bridge to `TranslationKey`. While i18n does not know a key `t()` returns the key itself
 * and the English text from `CF_EN` is used instead.
 */
export function useCashFlowText(): (key: CashFlowKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(CF_EN[key], vars) : translated;
    },
    [t],
  );
}
