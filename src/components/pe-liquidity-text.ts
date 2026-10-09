"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { PEL_EN, type PelKey } from "@/lib/pe-liquidity-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the private-market liquidity UI. The keys are typed locally (`PelKey`) so this feature does
 * not depend on them being in `lib/i18n.ts`'s `TranslationKey` union yet: the cast below is the only place
 * that bridges the two. When the i18n files do not know a key, `t()` returns the key and English is used.
 */
export function usePeLiquidityText(): (key: PelKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(PEL_EN[key], vars) : translated;
    },
    [t],
  );
}

/** The validation codes of `lib/private-equity.ts` that have a message here. */
export function isPelKey(code: string): code is PelKey {
  return Object.prototype.hasOwnProperty.call(PEL_EN, code);
}
