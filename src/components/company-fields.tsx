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
  COMPANY_ENTITY_TYPES,
  type CompanyEntityType,
  type CompanyHeldVia,
  type CompanyMetadata,
} from "@/lib/companies";
import type { TranslationKey } from "@/lib/i18n";

export const ENTITY_TYPE_LABEL_KEYS: Record<CompanyEntityType, TranslationKey> = {
  llc: "company_type_llc",
  ltd: "company_type_ltd",
  corporation: "company_type_corporation",
  partnership: "company_type_partnership",
  sole_proprietorship: "company_type_sole_proprietorship",
  holding: "company_type_holding",
  other: "company_type_other",
};

const NONE = "__none__";

export function CompanyFields({
  value,
  onChange,
  holdingOptions,
}: {
  value: CompanyMetadata;
  onChange: (next: CompanyMetadata) => void;
  /** Other tracked Companies that can sit between you and this entity. */
  holdingOptions: { id: string; name: string }[];
}) {
  const { t } = useLanguage();

  function set<K extends keyof CompanyMetadata>(key: K, next: CompanyMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">{t("company_details")}</h3>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="company_legal_name">{t("company_legal_name")}</Label>
          <Input
            id="company_legal_name"
            value={value.legal_name}
            onChange={(e) => set("legal_name", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="company_type">{t("company_entity_type")}</Label>
          <Select
            value={value.entity_type}
            onValueChange={(next) => set("entity_type", next as CompanyEntityType)}
          >
            <SelectTrigger id="company_type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_ENTITY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(ENTITY_TYPE_LABEL_KEYS[type])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="company_jurisdiction">{t("company_jurisdiction")}</Label>
          <Input
            id="company_jurisdiction"
            placeholder={t("company_jurisdiction_placeholder")}
            value={value.jurisdiction}
            onChange={(e) => set("jurisdiction", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="company_reg">{t("company_registration_number")}</Label>
          <Input
            id="company_reg"
            value={value.registration_number}
            onChange={(e) => set("registration_number", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="company_industry">{t("company_industry")}</Label>
          <Input
            id="company_industry"
            value={value.industry}
            onChange={(e) => set("industry", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="company_incorporated">{t("company_incorporation_date")}</Label>
          <Input
            id="company_incorporated"
            type="date"
            value={value.incorporation_date}
            onChange={(e) => set("incorporation_date", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="company_role">{t("company_role")}</Label>
          <Input
            id="company_role"
            placeholder={t("company_role_placeholder")}
            value={value.role}
            onChange={(e) => set("role", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h4 className="text-sm font-medium text-foreground">{t("company_ownership_heading")}</h4>
        <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="company_ownership">{t("company_ownership_percentage")}</Label>
            <div className="relative w-full min-w-0">
              <Input
                id="company_ownership"
                type="number"
                step="any"
                min="0"
                max="100"
                className="pe-8"
                value={value.ownership_percentage ?? ""}
                onChange={(e) =>
                  set("ownership_percentage", e.target.value === "" ? null : Number(e.target.value))
                }
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("company_ownership_hint")}</p>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="company_held_via">{t("company_held_via")}</Label>
            <Select
              value={value.held_via}
              onValueChange={(next) => set("held_via", next as CompanyHeldVia)}
            >
              <SelectTrigger id="company_held_via" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">{t("company_held_personal")}</SelectItem>
                <SelectItem value="holding">{t("company_held_holding")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {value.held_via === "holding" && (
            <>
              {holdingOptions.length > 0 && (
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="company_holding">{t("company_holding_tracked")}</Label>
                  <Select
                    value={value.holding_company_id || NONE}
                    onValueChange={(next) => set("holding_company_id", next === NONE ? "" : next)}
                  >
                    <SelectTrigger id="company_holding" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t("company_holding_none")}</SelectItem>
                      {holdingOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="min-w-0 space-y-2">
                <Label htmlFor="company_holding_name">{t("company_holding_name")}</Label>
                <Input
                  id="company_holding_name"
                  placeholder={t("company_holding_name_placeholder")}
                  value={value.holding_name}
                  onChange={(e) => set("holding_name", e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {t("company_holding_hint")}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="company_valuation_method">{t("company_valuation_method")}</Label>
          <Input
            id="company_valuation_method"
            placeholder={t("company_valuation_method_placeholder")}
            value={value.valuation_method}
            onChange={(e) => set("valuation_method", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="company_valuation_date">{t("company_valuation_date")}</Label>
          <Input
            id="company_valuation_date"
            type="date"
            value={value.valuation_date}
            onChange={(e) => set("valuation_date", e.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t("company_value_hint")}</p>
      </div>
    </div>
  );
}
