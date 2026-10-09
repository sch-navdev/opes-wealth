"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { ANALYSIS_EN, type AnalysisKey } from "@/lib/asset-analysis/labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the asset Analysis tab (`an_*` keys). While i18n does not know a key `t()` returns the key
 * itself and the English text from `ANALYSIS_EN` is used instead (same pattern as `useBankingText`).
 */
export function useAnalysisText(): (key: AnalysisKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(ANALYSIS_EN[key], vars) : translated;
    },
    [t],
  );
}
