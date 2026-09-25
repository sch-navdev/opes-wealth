"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import type { VehicleMetadata } from "@/lib/vehicles";

export function VehicleFields({
  value,
  onChange,
}: {
  value: VehicleMetadata;
  onChange: (next: VehicleMetadata) => void;
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
      </div>
    </div>
  );
}
