"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { STAGE_LABEL_KEYS } from "@/components/private-equity-fields";

import { DetailField } from "@/components/asset-detail/shared";

import { PrivateEquityMetadata } from "@/lib/private-equity";

import type { TranslationKey } from "@/lib/i18n";

export function PrivateEquityDetailsSettings({
  t,
  privateEquityMetadata,
  maskValue,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  privateEquityMetadata: PrivateEquityMetadata;
  maskValue: (value: string | number) => string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">
          {t("private_equity_details")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailField label={t("pe_manager")} value={privateEquityMetadata.manager} />
        <DetailField label={t("pe_strategy")} value={privateEquityMetadata.strategy} />
        <DetailField label={t("pe_vintage_year")} value={privateEquityMetadata.vintage_year} />
        <DetailField
          label={t("pe_lifecycle_stage")}
          value={t(STAGE_LABEL_KEYS[privateEquityMetadata.lifecycle_stage])} />
        <DetailField
          label={t("entity_name")}
          value={privateEquityMetadata.entity_name} />
        <DetailField
          label={t("share_class")}
          value={privateEquityMetadata.share_class} />
        <DetailField
          label={t("ownership_percentage")}
          value={privateEquityMetadata.ownership_percentage != null
            ? maskValue(`${privateEquityMetadata.ownership_percentage}%`)
            : null} />
      </CardContent>
    </Card>
  );
}
