"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { DLAYOUT_EN, type DLayoutKey } from "@/lib/dashboard-layout-labels";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.replace(`{${name}}`, String(val));
  return out;
}

/**
 * Translator for the customisable-dashboard UI. The `dlayout_*` keys are typed locally
 * (`DLayoutKey`) so this feature does not depend on the keys being in `lib/i18n.ts`'s
 * `TranslationKey` union yet: the cast below is the only place that bridges the two. When the
 * i18n files do not know a key, `t()` returns the key itself; then the English text is used.
 */
export function useDashboardLayoutText(): (key: DLayoutKey, vars?: Vars) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(DLAYOUT_EN[key], vars) : translated;
    },
    [t],
  );
}

/** The translated name of a block (`dlayout_block_<id>`). */
export function blockLabelKey(id: string): DLayoutKey {
  return `dlayout_block_${id}` as DLayoutKey;
}
