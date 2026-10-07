"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { IRR_EN, type IrrKey } from "@/lib/irr-compare-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the IRR comparison UI. The `irr_*` keys are typed locally (`IrrKey`); the cast is
 * the only bridge to `TranslationKey`. When i18n does not know a key, `t()` returns the key itself
 * and the English text from `IRR_EN` is used instead.
 */
export function useIrrText(): (key: IrrKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(IRR_EN[key], vars) : translated;
    },
    [t],
  );
}
