"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePrivacy } from "@/context/privacy-context";
import { useLanguage } from "@/context/language-context";
import { refreshExoticValuation } from "@/app/dashboard/exotic-actions";
import {
  EXOTIC_KIND_ICONS,
  EXOTIC_KIND_KEYS,
  WATCH_BOX_PAPERS_KEYS,
  WATCH_CONDITION_KEYS,
} from "@/components/exotic-assets-fields";
import { exoticGain, parseExoticMetadata } from "@/lib/exotic-assets";
import { cn } from "@/lib/utils";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

/**
 * Detail-page card for an Exotic Asset (watch): its specification, the current
 * value against the purchase price, and a "Refresh market value" action that
 * pulls the live Chrono24 valuation (see `lib/market-data/chrono24.ts`).
 */
export function ExoticAssetCard({
  assetId,
  metadata: rawMetadata,
  quantity,
  currentValue,
  currency,
}: {
  assetId: string;
  metadata: unknown;
  quantity: number;
  currentValue: number;
  currency: string;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const metadata = parseExoticMetadata(rawMetadata);
  const money = new Intl.NumberFormat(intlLocale, { style: "currency", currency });
  const unitValue = quantity > 0 ? currentValue / quantity : currentValue;
  const gain = exoticGain(unitValue, metadata.purchase_price);
  const KindIcon = EXOTIC_KIND_ICONS[metadata.kind];

  function handleRefresh() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await refreshExoticValuation(assetId);
      if (!result.ok) {
        setError((result.code === "not_configured" || result.code === "all_failed") ? t("exotic_not_configured") : result.error);
        return;
      }
      setMessage(t("exotic_value_updated", { value: money.format(result.value) }));
    });
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-foreground">
          <KindIcon className="size-4 text-primary" aria-hidden="true" />
          {t(EXOTIC_KIND_KEYS[metadata.kind])}
        </CardTitle>
        {metadata.kind === "watch" && (
          <Button type="button" variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
            <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
            {t("exotic_refresh")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metadata.kind === "watch" && (
            <>
              <Field label={t("exotic_brand")} value={metadata.brand} />
              <Field label={t("exotic_model")} value={metadata.model} />
              <Field label={t("exotic_reference")} value={metadata.reference_number} />
              <Field label={t("exotic_year")} value={metadata.year ? String(metadata.year) : null} />
              <Field label={t("exotic_condition")} value={t(WATCH_CONDITION_KEYS[metadata.condition])} />
              <Field label={t("exotic_box_papers")} value={t(WATCH_BOX_PAPERS_KEYS[metadata.box_papers])} />
            </>
          )}
          {metadata.kind === "wine" && (
            <>
              <Field label={t("exotic_producer")} value={metadata.producer} />
              <Field label={t("exotic_vintage")} value={metadata.vintage ? String(metadata.vintage) : null} />
              <Field label={t("exotic_region")} value={metadata.region} />
              <Field label={t("exotic_bottles")} value={quantity.toLocaleString(intlLocale)} />
            </>
          )}
          {metadata.kind === "art" && (
            <>
              <Field label={t("exotic_artist")} value={metadata.artist} />
              <Field label={t("exotic_title")} value={metadata.title} />
              <Field label={t("exotic_year")} value={metadata.art_year ? String(metadata.art_year) : null} />
              <Field label={t("exotic_medium")} value={metadata.medium} />
            </>
          )}
          {metadata.kind !== "wine" && <Field label={t("metal_serial")} value={metadata.serial_number} />}
          <Field label={t("metal_storage")} value={metadata.storage_location} />
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-3">
          <Field
            label={t("exotic_purchase_price")}
            value={metadata.purchase_price != null ? maskValue(money.format(metadata.purchase_price)) : null}
          />
          <Field label={t("exotic_market_value")} value={maskValue(money.format(unitValue))} />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("exotic_vs_purchase")}</p>
            {gain ? (
              <p className={cn("text-sm font-medium tabular-nums", gain.amount >= 0 ? "text-success" : "text-destructive")}>
                {gain.amount >= 0 ? "+" : "-"}
                {maskValue(money.format(Math.abs(gain.amount)))}
                {gain.percent != null && ` (${gain.percent >= 0 ? "+" : ""}${gain.percent.toFixed(1)}%)`}
              </p>
            ) : (
              <p className="text-sm text-foreground">—</p>
            )}
          </div>
        </div>

        {metadata.kind === "watch" && (
        <p className="text-xs text-muted-foreground">
          {metadata.last_priced_at
            ? t("exotic_last_priced", {
                date: new Date(metadata.last_priced_at).toLocaleDateString(intlLocale),
                source: metadata.last_price_source ?? "—",
              })
            : t("exotic_never_priced")}
        </p>
        )}
        {message && <p className="text-sm text-success">{message}</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
