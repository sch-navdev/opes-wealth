"use client";

import { useLanguage } from "@/context/language-context";
import type { TranslationKey } from "@/lib/i18n";
import { LANDING_EN } from "@/components/landing-copy-en";

export type LandingKey = keyof typeof LANDING_EN;

/**
 * Text for the landing page's new copy. The keys live in the app dictionary (`src/lib/i18n.ts`) like every
 * other string; `translate()` hands back the key itself when a key is not there yet, so until the dictionary
 * has them this falls back to the English in `landing-copy-en.ts` instead of showing a raw key.
 */
export function useLandingText(): (key: LandingKey) => string {
  const { t } = useLanguage();
  return (key) => {
    const text = t(key as unknown as TranslationKey);
    return text === key ? LANDING_EN[key] : text;
  };
}

/** Inline translated text for a landing key (usable from server components). */
export function LT({ k }: { k: LandingKey }) {
  const lt = useLandingText();
  return <>{lt(k)}</>;
}
