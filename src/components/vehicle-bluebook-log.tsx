"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import { deleteBlueBookEntry } from "@/app/dashboard/vehicle-actions";

export type BlueBookLogRow = {
  id: string;
  date: string;
  amount: number;
  /** Currency of the document. */
  currency: string;
  source: string;
  document: string;
  /** Same value in the asset's currency (what the chart plots). */
  converted: number;
};

/** The Blue Book valuations, oldest first, each removable; amounts in the document's currency with the asset-currency equivalent. */
export function VehicleBlueBookLog({ assetId, assetCurrency, rows, editable }: { assetId: string; assetCurrency: string; rows: BlueBookLogRow[]; editable: boolean }) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const fmt = (n: number, currency: string) => {
    try {
      return maskValue(new Intl.NumberFormat(intlLocale, { style: "currency", currency, maximumFractionDigits: 0 }).format(n));
    } catch {
      return maskValue(`${n.toLocaleString(intlLocale)} ${currency}`);
    }
  };

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("bluebook_none")}</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t("bluebook_log_title")}</p>
      <ul className="divide-y divide-border border border-border">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {fmt(r.amount, r.currency)}
                {r.currency !== assetCurrency && <span className="ms-2 text-xs font-normal text-muted-foreground">≈ {fmt(r.converted, assetCurrency)}</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[r.date, r.source, r.document].filter(Boolean).join(" · ")}
              </p>
            </div>
            {editable && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={t("bluebook_delete")}
                title={t("bluebook_delete")}
                disabled={pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await deleteBlueBookEntry(assetId, r.id);
                    if (!res.ok) setError(res.error);
                    else router.refresh();
                  });
                }}
              >
                <Minus className="size-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
