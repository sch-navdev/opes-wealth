"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBankingText } from "@/components/banking-text";
import { useLanguage } from "@/context/language-context";
import { balanceAgeDays, isBalanceStale } from "@/lib/bank-staleness";
import { cn } from "@/lib/utils";

/** `YYYY-MM-DD` formatted in the UI language (UTC, so the calendar day never shifts with the time zone). */
export function formatIsoDay(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

/**
 * "Balance as of <date>" under an account's balance. When the date is more than a month (31 days)
 * before `today` it turns red AND carries a "Stale: N days old" label with an icon, so the state is
 * never conveyed by colour alone.
 */
export function BalanceAsOf({ asOf, today }: { asOf: string | null | undefined; today: string }) {
  const tx = useBankingText();
  const { intlLocale } = useLanguage();
  if (!asOf) return <p className="text-xs text-muted-foreground">{tx("bank_asof_unknown")}</p>;
  const stale = isBalanceStale(asOf, today);
  return (
    <p
      className={cn("flex flex-wrap items-center justify-end gap-1.5 text-xs", stale ? "font-medium text-destructive" : "text-muted-foreground")}
      data-stale={stale ? "true" : "false"}
    >
      <span>{tx("bank_asof_label", { date: formatIsoDay(asOf, intlLocale) })}</span>
      {stale && (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="size-3" aria-hidden="true" />
          {tx("bank_asof_stale", { n: balanceAgeDays(asOf, today) ?? 0 })}
        </Badge>
      )}
    </p>
  );
}
