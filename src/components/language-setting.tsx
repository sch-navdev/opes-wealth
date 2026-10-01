"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";

/** Labelled language picker for the Settings page. */
export function LanguageSetting() {
  const { t } = useLanguage();
  return (
    <>
      <Label className="text-sm text-foreground">{t("language_switch")}</Label>
      <LanguageSwitcher compact={false} />
      <p className="text-xs text-muted-foreground">{t("language_switch_hint")}</p>
    </>
  );
}
