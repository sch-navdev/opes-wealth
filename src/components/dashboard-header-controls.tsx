"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { PrivacyToggleButton } from "@/components/privacy-toggle-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";

export function DashboardHeaderControls({
  totalNetWorthFormatted,
}: {
  totalNetWorthFormatted: string;
}) {
  const { maskValue } = usePrivacy();
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-xs text-muted-foreground">{t("net_worth")}</p>
        <p className="text-sm font-semibold text-foreground">
          {maskValue(totalNetWorthFormatted)}
        </p>
      </div>
      <PrivacyToggleButton />
      <LanguageSwitcher />
      <ThemeToggle />
    </div>
  );
}
