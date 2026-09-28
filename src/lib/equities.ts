/**
 * Metadata shape for the "Equities" asset category, stored in
 * `assets.metadata` (same jsonb-per-category pattern as `RealEstateMetadata`
 * in `real-estate.ts` — no dedicated `equities` table). The ticker itself
 * lives on `assets.ticker_symbol` (a shared top-level column, not metadata,
 * since Crypto also needs a ticker for display alongside its own
 * `coingecko_id`) — see `add-asset-dialog.tsx`'s shared Ticker Symbol field.
 * Consumed by `equity-fields.tsx` (add/edit form), the Settings tab of
 * `asset-detail-view.tsx` (read-only display), and the "Refresh Market
 * Price" flow, which writes `last_unit_price`/`last_priced_at`/
 * `last_price_source` back into this object after a successful fetch.
 */
export type EquityMetadata = {
  /** Free-text, e.g. "NASDAQ" — for display only; Finnhub's `/quote` doesn't need it for a US ticker. */
  exchange: string;
  last_unit_price: number | null;
  last_priced_at: string | null;
  last_price_source: string | null;
};

export const EMPTY_EQUITY_METADATA: EquityMetadata = {
  exchange: "",
  last_unit_price: null,
  last_priced_at: null,
  last_price_source: null,
};

/**
 * Merges a raw `assets.metadata` value into a complete `EquityMetadata`,
 * same defensive pattern as `parseRealEstateMetadata`.
 */
export function parseEquityMetadata(raw: unknown): EquityMetadata {
  if (!raw || typeof raw !== "object") {
    return EMPTY_EQUITY_METADATA;
  }

  return {
    ...EMPTY_EQUITY_METADATA,
    ...(raw as Partial<EquityMetadata>),
  };
}
