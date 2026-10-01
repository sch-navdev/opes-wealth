import { isValidWalletAddress, type WalletChain } from "@/lib/market-data/wallet-balance";

export type CryptoHoldingSource = "manual" | "wallet";

/**
 * Metadata shape for the "Crypto" asset category, stored in
 * `assets.metadata` (same jsonb-per-category pattern as `RealEstateMetadata`
 * in `real-estate.ts` — no dedicated `crypto` table). The display ticker
 * (e.g. "BTC") lives on the shared `assets.ticker_symbol` column; `coingecko_id`
 * here is the separate, required identifier CoinGecko's API actually keys
 * on (e.g. "bitcoin", not "BTC" — CoinGecko's `/simple/price` endpoint takes
 * its own slug, never a ticker, and guessing the mapping wrong would price
 * the wrong asset entirely, so it's a distinct required field rather than
 * derived from the ticker). Consumed by `crypto-fields.tsx` (add/edit form),
 * the Settings tab of `asset-detail-view.tsx`, and the "Refresh Market
 * Price" flow, which writes `last_unit_price`/`last_priced_at`/
 * `last_price_source` back into this object after a successful fetch.
 */
export type CryptoMetadata = {
  /** CoinGecko's coin id, e.g. "bitcoin", "ethereum" — found in the coin's CoinGecko URL. */
  coingecko_id: string;
  /**
   * How the quantity is kept current: `manual` (typed in — e.g. coins held on
   * an exchange) or `wallet` (read from a public on-chain address by
   * "Sync wallet"). Absent on rows saved before OW7 — treated as `manual`.
   */
  holding_source: CryptoHoldingSource;
  /** Exchange / custodian name for manual holdings (e.g. "Binance", "Coinbase", "Ledger"). */
  exchange_name: string;
  /** Wallet holdings only: the chain and PUBLIC address that are read (never keys). */
  wallet_chain: WalletChain | "";
  wallet_address: string;
  /** Last successful wallet sync (ISO) and the balance it read, in whole coins. */
  last_synced_at: string | null;
  last_synced_balance: number | null;
  last_unit_price: number | null;
  last_priced_at: string | null;
  last_price_source: string | null;
};

export const EMPTY_CRYPTO_METADATA: CryptoMetadata = {
  coingecko_id: "",
  holding_source: "manual",
  exchange_name: "",
  wallet_chain: "",
  wallet_address: "",
  last_synced_at: null,
  last_synced_balance: null,
  last_unit_price: null,
  last_priced_at: null,
  last_price_source: null,
};

/**
 * Merges a raw `assets.metadata` value into a complete `CryptoMetadata`,
 * same defensive pattern as `parseRealEstateMetadata`.
 */
export function parseCryptoMetadata(raw: unknown): CryptoMetadata {
  if (!raw || typeof raw !== "object") {
    return EMPTY_CRYPTO_METADATA;
  }

  return {
    ...EMPTY_CRYPTO_METADATA,
    ...(raw as Partial<CryptoMetadata>),
  };
}

/**
 * Returns every unmet requirement for a `CryptoMetadata` payload before it's
 * serialized into `assets.metadata` — same "collect every error, not just
 * the first" pattern as `getVehicleMetadataErrors`. `coingecko_id` is the
 * one required field: without it, "Refresh Market Price" has nothing to
 * query CoinGecko with.
 */
export function getCryptoMetadataErrors(metadata: CryptoMetadata): string[] {
  const errors: string[] = [];

  if (!metadata.coingecko_id.trim()) errors.push("crypto_coingecko_id_required");

  if (metadata.holding_source === "wallet") {
    if (!metadata.wallet_chain) {
      errors.push("crypto_wallet_chain_required");
    } else if (!isValidWalletAddress(metadata.wallet_chain, metadata.wallet_address)) {
      errors.push("crypto_wallet_address_invalid");
    }
  }

  return errors;
}
