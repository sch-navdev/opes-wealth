"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  const next = locale === "en" ? "fr" : "en";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Switch language to ${next === "en" ? "English" : "Français"}`}
      onClick={() => setLocale(next)}
    >
      {locale === "en" ? "EN" : "FR"}
    </Button>
  );
}
