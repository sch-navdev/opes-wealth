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
import type { CryptoHoldingSource, CryptoMetadata } from "@/lib/crypto";
import {
  WALLET_CHAINS,
  WALLET_CHAIN_COIN,
  type WalletChain,
} from "@/lib/market-data/wallet-balance";
import type { TranslationKey } from "@/lib/i18n";

const CHAIN_LABEL_KEYS: Record<WalletChain, TranslationKey> = {
  bitcoin: "crypto_chain_bitcoin",
  ethereum: "crypto_chain_ethereum",
  solana: "crypto_chain_solana",
};

export function CryptoFields({
  value,
  onChange,
  onTickerSuggest,
}: {
  value: CryptoMetadata;
  onChange: (next: CryptoMetadata) => void;
  /** Called when picking a chain implies a ticker (BTC/ETH/SOL), so the dialog's ticker field can follow. */
  onTickerSuggest?: (ticker: string) => void;
}) {
  const { t } = useLanguage();
  const isWallet = value.holding_source === "wallet";

  function set<K extends keyof CryptoMetadata>(key: K, next: CryptoMetadata[K]) {
    onChange({ ...value, [key]: next });
  }

  function pickChain(chain: WalletChain) {
    const coin = WALLET_CHAIN_COIN[chain];
    onChange({ ...value, wallet_chain: chain, coingecko_id: coin.coingeckoId });
    onTickerSuggest?.(coin.ticker);
  }

  return (
    <div className="w-full min-w-0 space-y-4 border-t border-border pt-6">
      <h3 className="text-sm font-medium text-foreground">
        {t("crypto_details")}
      </h3>

      <div className="min-w-0 space-y-2">
        <Label htmlFor="crypto_holding_source">{t("crypto_holding_source")}</Label>
        <Select
          value={value.holding_source}
          onValueChange={(next) => set("holding_source", next as CryptoHoldingSource)}
        >
          <SelectTrigger id="crypto_holding_source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{t("crypto_source_manual")}</SelectItem>
            <SelectItem value="wallet">{t("crypto_source_wallet")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isWallet ? (
        <>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="crypto_wallet_chain">{t("crypto_wallet_chain")}</Label>
            <Select
              value={value.wallet_chain || undefined}
              onValueChange={(next) => pickChain(next as WalletChain)}
            >
              <SelectTrigger id="crypto_wallet_chain" className="w-full">
                <SelectValue placeholder={t("crypto_wallet_chain_placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {WALLET_CHAINS.map((chain) => (
                  <SelectItem key={chain} value={chain}>
                    {t(CHAIN_LABEL_KEYS[chain])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="crypto_wallet_address">{t("crypto_wallet_address")}</Label>
            <Input
              id="crypto_wallet_address"
              placeholder={t("crypto_wallet_address_placeholder")}
              value={value.wallet_address}
              onChange={(e) => set("wallet_address", e.target.value.trim())}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">{t("crypto_wallet_hint")}</p>
          </div>
        </>
      ) : (
        <div className="min-w-0 space-y-2">
          <Label htmlFor="crypto_exchange_name">{t("crypto_exchange_name")}</Label>
          <Input
            id="crypto_exchange_name"
            placeholder={t("crypto_exchange_name_placeholder")}
            value={value.exchange_name}
            onChange={(e) => set("exchange_name", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("crypto_exchange_hint")}</p>
        </div>
      )}

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
