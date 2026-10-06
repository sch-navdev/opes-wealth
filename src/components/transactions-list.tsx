"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionDetailsSheet } from "@/components/transaction-details-sheet";
import { useLanguage } from "@/context/language-context";
import { cn } from "@/lib/utils";
import { detailFromRow, type StoredTransactionRow } from "@/lib/transaction-detail";

const PAGE_SIZE = 25;

/**
 * Stored transactions of one Cash account (newest first, as loaded by the asset page): date,
 * description, signed amount. Each row opens the details drawer, whose prev / next walks this list.
 */
export function TransactionsList({
  transactions,
  currency,
}: {
  transactions: StoredTransactionRow[];
  /** The account's currency, used when a row carries none. */
  currency: string;
}) {
  const { t, intlLocale } = useLanguage();
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<number | null>(null);

  const details = useMemo(
    () => transactions.map((row) => detailFromRow({ ...row, currency: row.currency || currency })),
    [transactions, currency],
  );

  const dateFormat = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone: "UTC" });
    } catch {
      return null;
    }
  }, [intlLocale]);

  function money(amount: number, cur: string): string {
    try {
      return new Intl.NumberFormat(intlLocale, { style: "currency", currency: cur, signDisplay: "exceptZero" }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${cur}`;
    }
  }

  function day(iso: string): string {
    const parsed = new Date(`${iso}T00:00:00Z`);
    return dateFormat && !Number.isNaN(parsed.getTime()) ? dateFormat.format(parsed) : iso;
  }

  const visible = details.slice(0, shown);
  const remaining = details.length - visible.length;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{t("txd_list_title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {details.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("txd_list_empty")}</p>
        ) : (
          <>
            <ul className="divide-y divide-border border border-border">
              {visible.map((d, i) => (
                <li key={`${d.fingerprint ?? d.date}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 text-start text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="tabular-nums text-muted-foreground">{day(d.date)}</span>
                    <span className="truncate text-foreground">{d.description || t("txd_no_description")}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        d.amount < 0 ? "text-destructive" : d.amount > 0 ? "text-success" : "text-foreground",
                      )}
                    >
                      {money(d.amount, d.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                {t("txd_show_more", { n: remaining })}
              </Button>
            )}
          </>
        )}
      </CardContent>
      <TransactionDetailsSheet transactions={details} index={selected} onIndexChange={setSelected} />
    </Card>
  );
}
