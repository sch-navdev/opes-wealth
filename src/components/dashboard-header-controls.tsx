"use client";

import { ComfortModeToggle } from "@/components/comfort-mode-toggle";
import { CurrencySwitcher } from "@/components/currency-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PrivacyToggleButton } from "@/components/privacy-toggle-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";

export function DashboardHeaderControls({
  totalNetWorth,
  baseCurrency,
}: {
  totalNetWorth: number;
  baseCurrency: string;
}) {
  const { maskValue } = usePrivacy();
  const { t, intlLocale } = useLanguage();
  const totalNetWorthFormatted = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: baseCurrency,
  }).format(totalNetWorth);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="text-end">
        <p className="text-xs text-muted-foreground">
          {t("net_worth")} · {baseCurrency}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {maskValue(totalNetWorthFormatted)}
        </p>
      </div>
      <CurrencySwitcher value={baseCurrency} className="w-32" />
      <PrivacyToggleButton />
      <LanguageSwitcher />
      <ThemeToggle />
      <ComfortModeToggle />
    </div>
  );
}
