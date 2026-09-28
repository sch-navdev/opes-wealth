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
  last_unit_price: number | null;
  last_priced_at: string | null;
  last_price_source: string | null;
};

export const EMPTY_CRYPTO_METADATA: CryptoMetadata = {
  coingecko_id: "",
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

  return errors;
}
