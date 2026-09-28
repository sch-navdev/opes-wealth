"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import type { EquityMetadata } from "@/lib/equities";

export function EquityFields({
  value,
  onChange,
}: {
  value: EquityMetadata;
  onChange: (next: EquityMetadata) => void;
}) {
  const { t } = useLanguage();

  function set<K extends keyof EquityMetadata>(key: K, next: EquityMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">
        {t("equity_details")}
      </h3>

      <div className="min-w-0 space-y-2">
        <Label htmlFor="equity_exchange">{t("exchange")}</Label>
        <Input
          id="equity_exchange"
          placeholder={t("equity_exchange_placeholder")}
          value={value.exchange}
          onChange={(e) => set("exchange", e.target.value)}
        />
      </div>
    </div>
  );
}
