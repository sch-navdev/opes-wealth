"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { AV_EN, type AvKey } from "@/lib/assurance-vie-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the Assurance-Vie UI. The `av_*` keys are typed locally (`AvKey`) so this
 * feature does not depend on the keys being in `lib/i18n.ts`'s `TranslationKey` union yet: the
 * cast below is the only place that bridges the two. When the i18n files do not know a key,
 * `t()` returns the key itself and the English text is used.
 */
export function useAssuranceVieText(): (key: AvKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(AV_EN[key], vars) : translated;
    },
    [t],
  );
}

/** Error / warning codes from `lib/assurance-vie.ts` are `av_*` keys; unknown codes fall back to the generic message. */
export function isAvKey(code: string): code is AvKey {
  return Object.prototype.hasOwnProperty.call(AV_EN, code);
}
