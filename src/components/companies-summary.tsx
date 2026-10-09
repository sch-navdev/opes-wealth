"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";

/** Headline figures for the Companies module: entity count, your total stake, and the 100% equity value behind it. */
export function CompaniesSummary({
  count,
  totalStake,
  totalEquity,
  baseCurrency,
}: {
  count: number;
  totalStake: number;
  totalEquity: number;
  baseCurrency: string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatter = moneyFormatter(intlLocale, baseCurrency);

  const items = [
    { label: t("companies_count"), value: String(count) },
    { label: t("companies_total_stake"), value: maskValue(formatter.format(totalStake)) },
    { label: t("companies_total_equity"), value: maskValue(formatter.format(totalEquity)) },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} className="border-border bg-card">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
