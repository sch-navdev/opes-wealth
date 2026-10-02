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
  STARTUP_INVESTMENT_TYPES,
  type StartupInvestmentType,
  type StartupMetadata,
} from "@/lib/startups";
import type { TranslationKey } from "@/lib/i18n";

export const STARTUP_TYPE_KEYS: Record<StartupInvestmentType, TranslationKey> = {
  direct_equity: "startup_type_direct_equity",
  safe: "startup_type_safe",
  convertible_note: "startup_type_convertible_note",
  bspce_options: "startup_type_bspce_options",
};

function toNumberOrNull(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function StartupFields({
  value,
  onChange,
}: {
  value: StartupMetadata;
  onChange: (next: StartupMetadata) => void;
}) {
  const { t } = useLanguage();
  const isOptions = value.investment_type === "bspce_options";

  function set<K extends keyof StartupMetadata>(key: K, next: StartupMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">{t("startup_details")}</h3>
      <p className="text-xs text-muted-foreground">{t("startup_value_hint")}</p>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="startup_company">{t("startup_company")}</Label>
          <Input
            id="startup_company"
            value={value.company_name}
            onChange={(e) => set("company_name", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="startup_sector">{t("startup_sector")}</Label>
          <Input
            id="startup_sector"
            placeholder={t("startup_sector_placeholder")}
            value={value.sector}
            onChange={(e) => set("sector", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="startup_type">{t("startup_investment_type")}</Label>
          <Select
            value={value.investment_type}
            onValueChange={(next) => set("investment_type", next as StartupInvestmentType)}
          >
            <SelectTrigger id="startup_type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STARTUP_INVESTMENT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(STARTUP_TYPE_KEYS[type])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="startup_cost">{isOptions ? t("startup_strike") : t("startup_avg_cost")}</Label>
          <Input
            id="startup_cost"
            type="number"
            step="any"
            min="0"
            value={value.avg_cost_per_share ?? ""}
            onChange={(e) => set("avg_cost_per_share", toNumberOrNull(e.target.value))}
          />
          {isOptions && <p className="text-xs text-muted-foreground">{t("startup_options_hint")}</p>}
        </div>
      </div>
    </div>
  );
}
