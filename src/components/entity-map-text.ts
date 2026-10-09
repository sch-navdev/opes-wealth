"use client";

import { useLanguage } from "@/context/language-context";

export type Tx = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Translator for the entity-map keys. They live in `tmp-i18n-entity-map.json` until merged into the
 * dictionary (`src/lib/i18n.ts` + `translations/*`), so the strict `TranslationKey` type does not know
 * them yet; an unknown key renders as the key itself. Tighten to `t` once merged.
 */
export function useTx(): Tx {
  const { t } = useLanguage();
  return t as unknown as Tx;
}
