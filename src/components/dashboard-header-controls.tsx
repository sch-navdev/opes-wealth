"use client";

import { ComfortModeToggle } from "@/components/comfort-mode-toggle";
import { ApprovalsBell } from "@/components/approvals-bell";
import type { PendingApproval } from "@/lib/shared-assets/server";
import { CurrencySwitcher } from "@/components/currency-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PrivacyToggleButton } from "@/components/privacy-toggle-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";

export function DashboardHeaderControls({
  totalNetWorth,
  baseCurrency,
  pendingApprovals = [],
}: {
  totalNetWorth: number;
  baseCurrency: string;
  /** Edits to shared assets waiting for the signed-in user (see `approvals-bell.tsx`). */
  pendingApprovals?: PendingApproval[];
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
      <ApprovalsBell items={pendingApprovals} />
      <PrivacyToggleButton />
      <LanguageSwitcher />
      <ThemeToggle />
      <ComfortModeToggle />
    </div>
  );
}
