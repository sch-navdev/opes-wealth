"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import { getCurrencySymbol } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { effectiveDepreciation, estimateDepreciatedValue, type VehicleMetadata } from "@/lib/vehicles";

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
          <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {symbol}
          </span>
        )}
        <Input
          type="number"
          step="any"
          min="0"
          className={symbol ? "ps-12" : undefined}
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
  purchaseDate,
}: {
  value: VehicleMetadata;
  onChange: (next: VehicleMetadata) => void;
  currency: string;
  purchaseDate: string;
}) {
  const { t, intlLocale } = useLanguage();
  const rates = effectiveDepreciation(value, purchaseDate);
  const estimate = estimateDepreciatedValue(value, purchaseDate);
  const fmt = (n: number) => {
    try {
      return moneyFormatter(intlLocale, currency, { maximumFractionDigits: 0 }).format(n);
    } catch {
      return n.toLocaleString(intlLocale, { maximumFractionDigits: 0 });
    }
  };

  /** Typing a rate switches to manual mode and keeps both figures as shown. */
  function setRate(which: "first" | "annual", raw: string) {
    const n = raw === "" || raw === "-" ? 0 : Number(raw);
    if (!Number.isFinite(n)) return;
    onChange({
      ...value,
      depreciation_manual: true,
      depreciation_first_year: which === "first" ? n : rates.first,
      depreciation_annual: which === "annual" ? n : rates.annual,
    });
  }

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

      <div className="w-full min-w-0 space-y-4 border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground">{t("depreciation_title")}</h4>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 border border-border bg-muted/30 p-3">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={value.second_hand}
            onChange={(e) => set("second_hand", e.target.checked)}
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-foreground">{t("depreciation_second_hand")}</span>
            <span className="block text-xs text-muted-foreground">{t("depreciation_second_hand_hint")}</span>
          </span>
        </label>

        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {!value.second_hand && (
            <div className="min-w-0 space-y-2">
              <Label htmlFor="dep_first">{t("depreciation_first_year")}</Label>
              <Input
                id="dep_first"
                type="number"
                step="0.1"
                value={rates.first}
                onChange={(e) => setRate("first", e.target.value)}
              />
            </div>
          )}
          <div className="min-w-0 space-y-2">
            <Label htmlFor="dep_annual">{t(value.second_hand ? "depreciation_annual_used" : "depreciation_annual")}</Label>
            <Input
              id="dep_annual"
              type="number"
              step="0.1"
              value={rates.annual}
              onChange={(e) => setRate("annual", e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("depreciation_rate_hint")}</p>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {value.depreciation_manual ? t("depreciation_manual_note") : t("depreciation_auto_note", { group: t(`depreciation_group_${rates.group}` as never) })}
          </p>
          {value.depreciation_manual && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...value, depreciation_manual: false, depreciation_first_year: null, depreciation_annual: null })}
            >
              {t("depreciation_reset")}
            </Button>
          )}
        </div>

        {estimate != null && (
          <div className="border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{t("depreciation_estimate_label")}</p>
            <p className="text-lg font-semibold text-foreground">{fmt(estimate)}</p>
            <p className="text-xs text-muted-foreground">{t("depreciation_estimate_note")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
