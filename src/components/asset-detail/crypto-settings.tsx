"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DetailField } from "@/components/asset-detail/shared";

import { CryptoMetadata } from "@/lib/crypto";

import type { TranslationKey } from "@/lib/i18n";

import type { AssetDetail } from "@/components/asset-detail-view";

export function CryptoSettings({
  t,
  asset,
  cryptoMetadata,
  isWalletHolding,
  formatLastPricedAt,
  maskValue,
  currencyFormatter,
}: {
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  asset: AssetDetail;
  cryptoMetadata: CryptoMetadata;
  isWalletHolding: boolean;
  formatLastPricedAt: (iso: string | null) => string | null;
  maskValue: (value: string | number) => string;
  currencyFormatter: Intl.NumberFormat;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">
          {t("crypto_details")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailField label={t("ticker_symbol")} value={asset.ticker_symbol} />
        <DetailField label={t("coingecko_id")} value={cryptoMetadata.coingecko_id} />
        <DetailField
          label={t("crypto_holding_source")}
          value={isWalletHolding ? t("crypto_source_wallet") : t("crypto_source_manual")} />
        {isWalletHolding ? (
          <>
            <DetailField
              label={t("crypto_wallet_chain")}
              value={cryptoMetadata.wallet_chain || null} />
            <DetailField
              label={t("crypto_wallet_address")}
              value={cryptoMetadata.wallet_address || null} />
            <DetailField
              label={t("wallet_last_synced")}
              value={formatLastPricedAt(cryptoMetadata.last_synced_at)} />
          </>
        ) : (
          <DetailField
            label={t("crypto_exchange_name")}
            value={cryptoMetadata.exchange_name || null} />
        )}
        <DetailField
          label={t("unit_price")}
          value={cryptoMetadata.last_unit_price != null
            ? maskValue(currencyFormatter.format(cryptoMetadata.last_unit_price))
            : null} />
        <DetailField
          label={t("last_updated")}
          value={formatLastPricedAt(cryptoMetadata.last_priced_at)} />
      </CardContent>
    </Card>
  );
}
