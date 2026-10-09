"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { CFW_EN, type WaterfallKey } from "@/lib/cash-flow-waterfall-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/** Translator for the waterfall panel: `t()` when the key is merged into i18n, the English in `CFW_EN` otherwise. */
export function useWaterfallText(): (key: WaterfallKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(CFW_EN[key], vars) : translated;
    },
    [t],
  );
}
