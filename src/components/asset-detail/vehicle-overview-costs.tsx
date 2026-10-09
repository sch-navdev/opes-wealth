"use client";

import { formatPercentPoints } from "@/lib/money-parts";
import type { MoneyFormatter } from "@/lib/money-parts";
import { Badge } from "@/components/ui/badge";

import { Card, CardContent } from "@/components/ui/card";

import { VehicleMetadata, VehicleValuation } from "@/lib/vehicles";

import type { TranslationKey } from "@/lib/i18n";

export function VehicleOverviewCosts({
  t,
  vehicleTotalCost,
  maskValue,
  currencyFormatter,
  vehicleMetadata,
  intlLocale,
  vehicleChange,
  vehicleValuation,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  vehicleTotalCost: number | null;
  maskValue: (value: string | number) => string;
  currencyFormatter: MoneyFormatter;
  vehicleMetadata: VehicleMetadata;
  intlLocale: string;
  vehicleChange: { amount: number; percent: number | null; } | null;
  vehicleValuation: VehicleValuation | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Card className="border-border bg-card">
        <CardContent className="space-y-1 py-4">
          <p className="text-xs text-muted-foreground">
            {t("total_cost_of_ownership")}
          </p>
          <p className="text-lg font-semibold text-foreground">
            {vehicleTotalCost != null
              ? maskValue(currencyFormatter.format(vehicleTotalCost))
              : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("all_in_cost_basis")}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="space-y-1 py-4">
          <p className="text-xs text-muted-foreground">{t("mileage")}</p>
          <p className="text-lg font-semibold text-foreground">
            {vehicleMetadata.mileage != null
              ? maskValue(`${vehicleMetadata.mileage.toLocaleString(intlLocale)} km`)
              : "—"}
          </p>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardContent className="space-y-1 py-4">
          <p className="text-xs text-muted-foreground">
            {t("vehicle_value_change")}
          </p>
          <div className="flex w-full flex-wrap items-center gap-2">
            <p
              className={vehicleChange != null
                ? vehicleChange.amount >= 0
                  ? "text-lg font-semibold text-success"
                  : "text-lg font-semibold text-destructive"
                : "text-lg font-semibold text-foreground"}
            >
              {vehicleChange != null
                ? `${vehicleChange.amount >= 0 ? "+" : "-"}${maskValue(currencyFormatter.format(Math.abs(vehicleChange.amount)))}`
                : "—"}
            </p>
            {vehicleChange?.percent != null && (
              <Badge
                variant="secondary"
                className={vehicleChange.amount >= 0
                  ? "whitespace-nowrap bg-success px-2 py-0.5 text-success-foreground"
                  : "whitespace-nowrap bg-destructive px-2 py-0.5 text-destructive-foreground"}
              >
                {formatPercentPoints(vehicleChange.percent, intlLocale, { digits: 1, signDisplay: "always" })}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {vehicleValuation?.baselineSource === "purchase_price"
              ? t("vehicle_basis_purchase")
              : vehicleValuation?.baselineSource === "first_valuation"
                ? t("vehicle_basis_first_valuation", {
                  date: vehicleValuation.baselineDate ?? "",
                })
                : t("vehicle_basis_none")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
