"use client";

import type { MoneyFormatter } from "@/lib/money-parts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DetailField } from "@/components/asset-detail/shared";

import {
  effectiveDepreciation,
  estimateDepreciatedValue,
  latestBlueBook,
  parseVehicleMetadata,
  VehicleMetadata,
} from "@/lib/vehicles";
import { VehicleBlueBookDialog } from "@/components/vehicle-bluebook-dialog";
import { VehicleBlueBookLog } from "@/components/vehicle-bluebook-log";

import type { OwnershipStatus } from "@/lib/shared-assets/server";

import { convertAmount } from "@/lib/fx";

import type { TranslationKey } from "@/lib/i18n";

import type { AssetDetail } from "@/components/asset-detail-view";

export function VehicleSettings({
  t,
  vehicleMetadata,
  intlLocale,
  maskValue,
  currencyFormatter,
  ownershipStatus,
  asset,
  ratesFromUsd,
  vehicleTotalCost,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  vehicleMetadata: VehicleMetadata;
  intlLocale: string;
  maskValue: (value: string | number) => string;
  currencyFormatter: MoneyFormatter;
  ownershipStatus: OwnershipStatus | null;
  asset: AssetDetail;
  ratesFromUsd: Record<string, number>;
  vehicleTotalCost: number | null;
}) {
  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">
            {t("vehicle_details")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailField label={t("make")} value={vehicleMetadata.make} />
          <DetailField label={t("model")} value={vehicleMetadata.model} />
          <DetailField
            label={t("vehicle_year")}
            value={vehicleMetadata.year} />
          <DetailField label={t("vin")} value={vehicleMetadata.vin} />
          <DetailField
            label={t("license_plate")}
            value={vehicleMetadata.license_plate} />
          <DetailField
            label={t("mileage")}
            value={vehicleMetadata.mileage != null
              ? `${vehicleMetadata.mileage.toLocaleString(intlLocale)} km`
              : null} />
          {vehicleMetadata.last_valuation_date && (
            <DetailField
              label={t("last_valuation")}
              value={`${maskValue(
                currencyFormatter.format(vehicleMetadata.market_valuation ?? 0)
              )} (${vehicleMetadata.last_valuation_source === "autobiz"
                ? t("provider_autobiz")
                : t("provider_la_centrale")}, ${vehicleMetadata.last_valuation_date})`} />
          )}
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-foreground">{t("bluebook_title")}</CardTitle>
          {(!ownershipStatus || ownershipStatus.isCreator) && (
            <VehicleBlueBookDialog
              assetId={asset.id}
              assetCurrency={asset.currency}
              estimate={estimateDepreciatedValue(parseVehicleMetadata(asset.metadata), asset.purchase_date)} />
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailField
            label={t("bluebook_value")}
            value={(() => {
              const latest = latestBlueBook(vehicleMetadata);
              return latest
                ? maskValue(currencyFormatter.format(convertAmount(latest.amount, latest.currency || asset.currency, asset.currency, ratesFromUsd)))
                : t("bluebook_none");
            })()} />
          <DetailField label={t("bluebook_source")} value={latestBlueBook(vehicleMetadata)?.source || null} />
          <DetailField label={t("bluebook_date")} value={latestBlueBook(vehicleMetadata)?.date || null} />
          <DetailField
            label={t("depreciation_estimate_label")}
            value={(() => {
              const est = estimateDepreciatedValue(vehicleMetadata, asset.purchase_date);
              return est != null ? maskValue(currencyFormatter.format(est)) : null;
            })()} />
          <DetailField
            label={t("depreciation_title")}
            value={(() => {
              const r = effectiveDepreciation(vehicleMetadata, asset.purchase_date);
              const pct = (n: number) => (n > 0 ? "+" : "") + n + "%";
              return vehicleMetadata.second_hand
                ? t("depreciation_second_hand") + ": " + pct(r.annual) + " " + t("depreciation_per_year")
                : pct(r.first) + " / " + pct(r.annual) + " " + t("depreciation_per_year");
            })()} />
          <div className="sm:col-span-2 xl:col-span-4">
            <VehicleBlueBookLog
              assetId={asset.id}
              assetCurrency={asset.currency}
              editable={!ownershipStatus || ownershipStatus.isCreator}
              rows={vehicleMetadata.blue_book_log.map((e) => ({
                id: e.id,
                date: e.date,
                amount: e.amount,
                currency: e.currency || asset.currency,
                source: e.source,
                document: e.document,
                converted: convertAmount(e.amount, e.currency || asset.currency, asset.currency, ratesFromUsd),
              }))} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-foreground">
            {t("cost_fees_basis")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailField
            label={t("purchase_price")}
            value={vehicleMetadata.purchase_price != null
              ? maskValue(
                currencyFormatter.format(vehicleMetadata.purchase_price)
              )
              : null} />
          <DetailField
            label={t("maintenance_costs")}
            value={vehicleMetadata.maintenance_costs != null
              ? maskValue(
                currencyFormatter.format(vehicleMetadata.maintenance_costs)
              )
              : null} />
          <DetailField
            label={t("modifications")}
            value={vehicleMetadata.modifications != null
              ? maskValue(
                currencyFormatter.format(vehicleMetadata.modifications)
              )
              : null} />
          <DetailField
            label={t("insurance_registration")}
            value={vehicleMetadata.insurance_registration != null
              ? maskValue(
                currencyFormatter.format(
                  vehicleMetadata.insurance_registration
                )
              )
              : null} />
          <DetailField
            label={t("total_cost_of_ownership")}
            value={vehicleTotalCost != null
              ? maskValue(currencyFormatter.format(vehicleTotalCost))
              : null} />
        </CardContent>
      </Card>
    </>
  );
}
