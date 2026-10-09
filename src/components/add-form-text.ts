"use client";

import { useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";

type Vars = Record<string, string | number>;

export type AddFormTf = (key: string, en: string, vars?: Vars) => string;

function fill(text: string, vars?: Vars): string {
  let out = text;
  if (vars) for (const [name, val] of Object.entries(vars)) out = out.split(`{${name}}`).join(String(val));
  return out;
}

/**
 * Translator for the Add/Edit Asset form. `tf("af_re_address", "Address")` returns the dictionary text when
 * the key exists in i18n, otherwise the English default given at the call site (so the app and its tests
 * work before the keys are merged; once merged the dictionary wins). Placeholders are `{name}`.
 */
export function useAddFormText(): AddFormTf {
  const { t } = useLanguage();
  return useCallback(
    (key, en, vars) => {
      const translated = t(key as unknown as TranslationKey, vars);
      return translated === key ? fill(en, vars) : translated;
    },
    [t],
  );
}
