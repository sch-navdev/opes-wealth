"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";
import type { CryptoMetadata } from "@/lib/crypto";

export function CryptoFields({
  value,
  onChange,
}: {
  value: CryptoMetadata;
  onChange: (next: CryptoMetadata) => void;
}) {
  const { t } = useLanguage();

  function set<K extends keyof CryptoMetadata>(key: K, next: CryptoMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">
        {t("crypto_details")}
      </h3>

      <div className="min-w-0 space-y-2">
        <Label htmlFor="crypto_coingecko_id">{t("coingecko_id")}</Label>
        <Input
          id="crypto_coingecko_id"
          placeholder={t("coingecko_id_placeholder")}
          value={value.coingecko_id}
          onChange={(e) => set("coingecko_id", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {t("coingecko_id_hint")}
        </p>
      </div>
    </div>
  );
}
