"use client";

import { PrivacyToggleButton } from "@/components/privacy-toggle-button";
import { usePrivacy } from "@/context/privacy-context";

export function DashboardHeaderControls({
  totalNetWorthFormatted,
}: {
  totalNetWorthFormatted: string;
}) {
  const { maskValue } = usePrivacy();

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-xs text-muted-foreground">Net Worth</p>
        <p className="text-sm font-semibold text-foreground">
          {maskValue(totalNetWorthFormatted)}
        </p>
      </div>
      <PrivacyToggleButton />
    </div>
  );
}
