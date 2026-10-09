"use client";

import type { MoneyFormatter } from "@/lib/money-parts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { ENTITY_TYPE_LABEL_KEYS } from "@/components/company-fields";

import { parseCompanyMetadata } from "@/lib/companies";

import { DetailField } from "@/components/asset-detail/shared";

import type { TranslationKey } from "@/lib/i18n";

import type { AssetDetail } from "@/components/asset-detail-view";

export function CompanySettings({
  t,
  asset,
  maskValue,
  currencyFormatter,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  asset: AssetDetail;
  maskValue: (value: string | number) => string;
  currencyFormatter: MoneyFormatter;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{t("company_details")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(() => {
          const company = parseCompanyMetadata(asset.metadata);
          return (
            <>
              <DetailField label={t("company_legal_name")} value={company.legal_name} />
              <DetailField
                label={t("company_entity_type")}
                value={t(ENTITY_TYPE_LABEL_KEYS[company.entity_type])} />
              <DetailField label={t("company_jurisdiction")} value={company.jurisdiction} />
              <DetailField
                label={t("company_registration_number")}
                value={company.registration_number} />
              <DetailField label={t("company_industry")} value={company.industry} />
              <DetailField label={t("company_role")} value={company.role} />
              <DetailField
                label={t("company_ownership_percentage")}
                value={company.ownership_percentage != null
                  ? maskValue(`${company.ownership_percentage}%`)
                  : null} />
              <DetailField
                label={t("company_held_via")}
                value={company.held_via === "holding"
                  ? `${t("company_held_holding")}${company.holding_name ? ` · ${company.holding_name}` : ""}`
                  : t("company_held_personal")} />
              <DetailField
                label={t("company_equity_value")}
                value={company.company_value != null
                  ? maskValue(currencyFormatter.format(company.company_value))
                  : null} />
              <DetailField
                label={t("company_valuation_date")}
                value={company.valuation_date || company.valuation_method || null} />
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
