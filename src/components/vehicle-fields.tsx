"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { getCurrencySymbol } from "@/lib/currencies";
import type { VehicleMetadata } from "@/lib/vehicles";

function NumberField({
  label,
  value,
  onChange,
  currency,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  currency?: string;
}) {
  const symbol = currency ? getCurrencySymbol(currency) : null;
  return (
    <div className="w-full min-w-0 space-y-2">
      <Label>{label}</Label>
      <div className="relative w-full min-w-0">
        {symbol && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {symbol}
          </span>
        )}
        <Input
          type="number"
          step="any"
          min="0"
          className={symbol ? "pl-12" : undefined}
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
        />
      </div>
    </div>
  );
}

export function VehicleFields({
  value,
  onChange,
  currency,
}: {
  value: VehicleMetadata;
  onChange: (next: VehicleMetadata) => void;
  currency: string;
}) {
  const { t } = useLanguage();

  function set<K extends keyof VehicleMetadata>(key: K, next: VehicleMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">
        {t("vehicle_details")}
      </h3>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="vehicle_make">{t("make")}</Label>
          <Input
            id="vehicle_make"
            placeholder={t("vehicle_make_placeholder")}
            value={value.make}
            onChange={(e) => set("make", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="vehicle_model">{t("model")}</Label>
          <Input
            id="vehicle_model"
            placeholder={t("vehicle_model_placeholder")}
            value={value.model}
            onChange={(e) => set("model", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="vehicle_year">{t("vehicle_year")}</Label>
          <Input
            id="vehicle_year"
            placeholder={t("vehicle_year_placeholder")}
            value={value.year}
            onChange={(e) => set("year", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="vehicle_vin">{t("vin")}</Label>
          <Input
            id="vehicle_vin"
            placeholder={t("vehicle_vin_placeholder")}
            value={value.vin}
            onChange={(e) => set("vin", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="vehicle_license_plate">{t("license_plate")}</Label>
          <Input
            id="vehicle_license_plate"
            placeholder={t("license_plate_placeholder")}
            value={value.license_plate}
            onChange={(e) => set("license_plate", e.target.value)}
          />
        </div>
        <NumberField
          label={t("mileage")}
          value={value.mileage}
          onChange={(next) => set("mileage", next)}
        />
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 border-t border-border pt-4">
        <NumberField
          label={t("purchase_price")}
          value={value.purchase_price}
          onChange={(next) => set("purchase_price", next)}
          currency={currency}
        />
        <NumberField
          label={t("maintenance_costs")}
          value={value.maintenance_costs}
          onChange={(next) => set("maintenance_costs", next)}
          currency={currency}
        />
        <NumberField
          label={t("modifications")}
          value={value.modifications}
          onChange={(next) => set("modifications", next)}
          currency={currency}
        />
        <NumberField
          label={t("insurance_registration")}
          value={value.insurance_registration}
          onChange={(next) => set("insurance_registration", next)}
          currency={currency}
        />
      </div>
    </div>
  );
}
