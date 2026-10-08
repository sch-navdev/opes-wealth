"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DetailField } from "@/components/asset-detail/shared";

import { EquityMetadata } from "@/lib/equities";

import type { TranslationKey } from "@/lib/i18n";

import type { AssetDetail } from "@/components/asset-detail-view";

export function EquitySettings({
  t,
  asset,
  equityMetadata,
  maskValue,
  displayAsset,
  intlLocale,
  avgCostBasis,
  currencyFormatter,
  formatLastPricedAt,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  asset: AssetDetail;
  equityMetadata: EquityMetadata;
  maskValue: (value: string | number) => string;
  displayAsset: AssetDetail;
  intlLocale: string;
  avgCostBasis: number | null;
  currencyFormatter: Intl.NumberFormat;
  formatLastPricedAt: (iso: string | null) => string | null;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">
          {t("equity_details")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DetailField label={t("ticker_symbol")} value={asset.ticker_symbol} />
        <DetailField label={t("exchange")} value={equityMetadata.exchange} />
        <DetailField
          label={t("shares_owned")}
          value={maskValue(displayAsset.quantity.toLocaleString(intlLocale))} />
        <DetailField
          label={t("average_cost_basis")}
          value={avgCostBasis != null
            ? maskValue(currencyFormatter.format(avgCostBasis))
            : null} />
        <DetailField
          label={t("current_price")}
          value={equityMetadata.last_unit_price != null
            ? maskValue(currencyFormatter.format(equityMetadata.last_unit_price))
            : null} />
        <DetailField
          label={t("total_value")}
          value={maskValue(currencyFormatter.format(displayAsset.current_value))} />
        <DetailField
          label={t("last_updated")}
          value={formatLastPricedAt(equityMetadata.last_priced_at)} />
      </CardContent>
    </Card>
  );
}
