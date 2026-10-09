"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanyCashText } from "@/components/company-cash-text";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { cn } from "@/lib/utils";

/** Headline figures for the Companies module: entity count, your total stake, and the 100% equity value behind it. */
export function CompaniesSummary({
  count,
  totalStake,
  totalEquity,
  baseCurrency,
  companyCash,
}: {
  count: number;
  totalStake: number;
  totalEquity: number;
  baseCurrency: string;
  /** Σ of the companies' bank accounts (Base Currency): in net worth, apart from the stake. Omitted: no card. */
  companyCash?: number;
}) {
  const { t, intlLocale } = useLanguage();
  const cco = useCompanyCashText();
  const { maskValue } = usePrivacy();
  const formatter = moneyFormatter(intlLocale, baseCurrency);

  const items = [
    { label: t("companies_count"), value: String(count) },
    { label: t("companies_total_stake"), value: maskValue(formatter.format(totalStake)) },
    { label: t("companies_total_equity"), value: maskValue(formatter.format(totalEquity)) },
    ...(companyCash === undefined
      ? []
      : [
          {
            label: cco("cco_summary_label"),
            value: maskValue(formatter.format(companyCash)),
            note: cco("cco_summary_note"),
          },
        ]),
  ];

  return (
    <div className={cn("grid grid-cols-1 gap-4", items.length > 3 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
      {items.map((item) => (
        <Card key={item.label} className="border-border bg-card">
          <CardContent className="space-y-1 py-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">{item.value}</p>
            {"note" in item && item.note ? <p className="text-xs text-muted-foreground">{item.note}</p> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
