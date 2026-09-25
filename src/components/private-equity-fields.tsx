"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import type { PrivateEquityMetadata } from "@/lib/private-equity";

export function PrivateEquityFields({
  value,
  onChange,
}: {
  value: PrivateEquityMetadata;
  onChange: (next: PrivateEquityMetadata) => void;
}) {
  const { t } = useLanguage();

  function set<K extends keyof PrivateEquityMetadata>(
    key: K,
    next: PrivateEquityMetadata[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">
        {t("private_equity_details")}
      </h3>

      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2 sm:col-span-2">
          <Label htmlFor="pe_entity_name">{t("entity_name")}</Label>
          <Input
            id="pe_entity_name"
            placeholder={t("entity_name_placeholder")}
            value={value.entity_name}
            onChange={(e) => set("entity_name", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pe_share_class">{t("share_class")}</Label>
          <Input
            id="pe_share_class"
            placeholder={t("share_class_placeholder")}
            value={value.share_class}
            onChange={(e) => set("share_class", e.target.value)}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="pe_ownership_percentage">
            {t("ownership_percentage")}
          </Label>
          <div className="relative w-full min-w-0">
            <Input
              id="pe_ownership_percentage"
              type="number"
              step="any"
              min="0"
              max="100"
              className="pr-8"
              value={value.ownership_percentage ?? ""}
              onChange={(e) =>
                set(
                  "ownership_percentage",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
