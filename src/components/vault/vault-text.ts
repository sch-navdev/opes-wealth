"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { VAULT_EN, fillVault, type VaultKey } from "@/lib/vault-labels";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Translator for the vault UI. Keys are typed locally, so the feature does not depend on them being in
 * `lib/i18n.ts`: when a key is unknown to the dictionaries `t()` returns the key and English is used.
 */
export function useVaultText(): (key: VaultKey, vars?: Record<string, string | number>) => string {
  const { t } = useLanguage();
  return useCallback(
    (key, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fillVault(VAULT_EN[key], vars) : translated;
    },
    [t],
  );
}
