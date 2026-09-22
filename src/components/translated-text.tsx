"use client";

import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";

export function T({
  k,
  vars,
}: {
  k: TranslationKey;
  vars?: Record<string, string | number>;
}) {
  const { t } = useLanguage();
  return <>{t(k, vars)}</>;
}
