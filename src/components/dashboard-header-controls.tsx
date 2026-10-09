"use client";

import { CommandMenuTrigger } from "@/components/command-menu";
import { DashboardCustomizeButton } from "@/components/dashboard-customize-button";
import { ComfortModeToggle } from "@/components/comfort-mode-toggle";
import { ApprovalsBell } from "@/components/approvals-bell";
import { NotificationsBell } from "@/components/notifications-bell";
import type { NotificationItem } from "@/lib/notifications";
import type { PendingApproval } from "@/lib/shared-assets/server";
import { FxRatesStatus } from "@/components/fx-rates-status";
import type { FxStatusView } from "@/lib/fx-history";
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
  notifications = [],
  fxStatus,
}: {
  totalNetWorth: number;
  baseCurrency: string;
  /** Edits to shared assets waiting for the signed-in user (see `approvals-bell.tsx`). */
  pendingApprovals?: PendingApproval[];
  /** Outcomes of changes the signed-in user proposed (see `notifications-bell.tsx`). */
  notifications?: NotificationItem[];
  /** State of the stored daily exchange rates (see `fx-rates-status.tsx`); omitted = no indicator. */
  fxStatus?: FxStatusView;
}) {
  const { maskValue } = usePrivacy();
  const { t, intlLocale } = useLanguage();
  const totalNetWorthFormatted = new Intl.NumberFormat(intlLocale, {
    style: "currency",
    currency: baseCurrency,
  }).format(totalNetWorth);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <CommandMenuTrigger />
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
      <NotificationsBell items={notifications} />
      <PrivacyToggleButton />
      <LanguageSwitcher />
      <ThemeToggle />
      <ComfortModeToggle />
      <DashboardCustomizeButton />
      {fxStatus ? <FxRatesStatus status={fxStatus} className="basis-full justify-end" /> : null}
    </div>
  );
}
