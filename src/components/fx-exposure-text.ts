"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { FXBAR_EN, type FxBarKey } from "@/lib/fx-exposure-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, String(val));
  return out;
}

/**
 * Translator for the Global exposure bar. `fxbar_*` keys are typed locally (`FxBarKey`) so the feature
 * does not depend on them being in `lib/i18n.ts`'s `TranslationKey` union yet; when the i18n files do not
 * know a key, `t()` returns the key itself and the English text is used (same approach as
 * `dashboard-layout-text.ts`).
 */
export function useFxBarText(): (key: FxBarKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(FXBAR_EN[key], vars) : translated;
    },
    [t],
  );
}
