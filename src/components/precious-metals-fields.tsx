"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/context/language-context";
import {
  DEFAULT_PURITY,
  METAL_FORMS,
  METAL_TYPES,
  WEIGHT_UNITS,
  fineTroyOunces,
  type MetalForm,
  type MetalType,
  type PreciousMetalMetadata,
  type WeightUnit,
} from "@/lib/precious-metals";
import type { TranslationKey } from "@/lib/i18n";

export const METAL_LABEL_KEYS: Record<MetalType, TranslationKey> = {
  gold: "metal_gold",
  silver: "metal_silver",
  platinum: "metal_platinum",
};

export const METAL_FORM_LABEL_KEYS: Record<MetalForm, TranslationKey> = {
  bar: "metal_form_bar",
  coin: "metal_form_coin",
};

const UNIT_LABEL_KEYS: Record<WeightUnit, TranslationKey> = {
  g: "metal_unit_g",
  kg: "metal_unit_kg",
  oz: "metal_unit_oz",
};

function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function PreciousMetalsFields({
  value,
  onChange,
  quantity,
}: {
  value: PreciousMetalMetadata;
  onChange: (next: PreciousMetalMetadata) => void;
  /** Pieces held (the dialog's Quantity), only used for the fine-weight preview. */
  quantity: number;
}) {
  const { t } = useLanguage();

  function set<K extends keyof PreciousMetalMetadata>(key: K, next: PreciousMetalMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  const fineOz = fineTroyOunces(value, quantity);

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">{t("metal_details")}</h3>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="metal_type">{t("metal_type")}</Label>
          <Select
            value={value.metal}
            onValueChange={(next) =>
              onChange({
                ...value,
                metal: next as MetalType,
                // Re-prefill fineness for the new metal.
                purity: DEFAULT_PURITY[next as MetalType],
              })
            }
          >
            <SelectTrigger id="metal_type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METAL_TYPES.map((metal) => (
                <SelectItem key={metal} value={metal}>
                  {t(METAL_LABEL_KEYS[metal])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-2">
          <Label htmlFor="metal_form">{t("metal_form")}</Label>
          <Select value={value.form} onValueChange={(next) => set("form", next as MetalForm)}>
            <SelectTrigger id="metal_form" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METAL_FORMS.map((form) => (
                <SelectItem key={form} value={form}>
                  {t(METAL_FORM_LABEL_KEYS[form])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-2">
          <Label htmlFor="metal_weight">{t("metal_weight_per_unit")}</Label>
          <div className="flex gap-2">
            <Input
              id="metal_weight"
              type="number"
              step="any"
              min="0"
              placeholder="1"
              value={value.weight_per_unit ?? ""}
              onChange={(e) => set("weight_per_unit", toNumberOrNull(e.target.value))}
            />
            <Select
              value={value.weight_unit}
              onValueChange={(next) => set("weight_unit", next as WeightUnit)}
            >
              <SelectTrigger className="w-28 shrink-0" aria-label={t("metal_weight_unit")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEIGHT_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {t(UNIT_LABEL_KEYS[unit])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <Label htmlFor="metal_purity">{t("metal_purity")}</Label>
          <Input
            id="metal_purity"
            type="number"
            step="0.0001"
            min="0"
            max="1"
            value={value.purity}
            onChange={(e) => set("purity", Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">{t("metal_purity_hint")}</p>
        </div>

        <div className="min-w-0 space-y-2">
          <Label htmlFor="metal_premium">{t("metal_premium")}</Label>
          <Input
            id="metal_premium"
            type="number"
            step="0.1"
            placeholder="0"
            value={value.premium_pct ?? ""}
            onChange={(e) => set("premium_pct", toNumberOrNull(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">{t("metal_premium_hint")}</p>
        </div>

        <div className="min-w-0 space-y-2">
          <Label htmlFor="metal_serial">{t("metal_serial")}</Label>
          <Input
            id="metal_serial"
            value={value.serial_number}
            onChange={(e) => set("serial_number", e.target.value)}
          />
        </div>

        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="metal_storage">{t("metal_storage")}</Label>
          <Input
            id="metal_storage"
            placeholder={t("metal_storage_placeholder")}
            value={value.storage_location}
            onChange={(e) => set("storage_location", e.target.value)}
          />
        </div>
      </div>

      {fineOz > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("metal_fine_weight", { oz: fineOz.toFixed(4) })} · {t("metal_value_hint")}
        </p>
      )}
    </div>
  );
}
