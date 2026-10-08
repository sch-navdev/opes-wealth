"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DetailField } from "@/components/asset-detail/shared";

import { fineTroyOunces, PreciousMetalMetadata } from "@/lib/precious-metals";
import { METAL_FORM_LABEL_KEYS, METAL_LABEL_KEYS } from "@/components/precious-metals-fields";

import type { TranslationKey } from "@/lib/i18n";

import type { AssetDetail } from "@/components/asset-detail-view";

export function PreciousMetalSettings({
  t,
  metalMetadata,
  displayAsset,
  maskValue,
  currencyFormatter,
  formatLastPricedAt,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  metalMetadata: PreciousMetalMetadata;
  displayAsset: AssetDetail;
  maskValue: (value: string | number) => string;
  currencyFormatter: Intl.NumberFormat;
  formatLastPricedAt: (iso: string | null) => string | null;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{t("metal_details")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailField label={t("metal_type")} value={t(METAL_LABEL_KEYS[metalMetadata.metal])} />
        <DetailField label={t("metal_form")} value={t(METAL_FORM_LABEL_KEYS[metalMetadata.form])} />
        <DetailField label={t("quantity_pieces")} value={String(displayAsset.quantity)} />
        <DetailField
          label={t("metal_weight_per_unit")}
          value={metalMetadata.weight_per_unit != null
            ? `${metalMetadata.weight_per_unit} ${metalMetadata.weight_unit}`
            : null} />
        <DetailField label={t("metal_purity")} value={String(metalMetadata.purity)} />
        <DetailField
          label={t("metal_fine_weight_label")}
          value={`${fineTroyOunces(metalMetadata, displayAsset.quantity).toFixed(4)} oz t`} />
        <DetailField
          label={t("metal_premium")}
          value={metalMetadata.premium_pct != null ? `${metalMetadata.premium_pct}%` : null} />
        <DetailField
          label={t("metal_spot_per_oz")}
          value={metalMetadata.last_spot_price != null
            ? maskValue(currencyFormatter.format(metalMetadata.last_spot_price))
            : null} />
        <DetailField label={t("metal_serial")} value={metalMetadata.serial_number || null} />
        <DetailField
          label={t("metal_storage")}
          value={metalMetadata.storage_location || null} />
        <DetailField
          label={t("last_updated")}
          value={formatLastPricedAt(metalMetadata.last_priced_at)} />
      </CardContent>
    </Card>
  );
}
