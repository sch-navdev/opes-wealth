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

/**
 * One lot from a broker import or manual entry (Phase 2, Broker Trade
 * Import — `tracker/Broker-Trade-Import.md`). `id` is a stable dedupe key
 * (see `tradeId` in `parsers/broker-registry.ts`-adjacent import logic) so
 * re-importing the same broker export doesn't double-count a trade already
 * on record — same "re-import regenerates in place" idea as
 * `importBankCsvHistory`'s `onConflict` upsert, just applied inside a jsonb
 * array instead of a DB unique constraint.
 */
export type EquityTrade = {
  id: string;
  tradeDate: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  currency: string;
  /** e.g. "saxo", "manual" — which import produced this lot. */
  source: string;
  /** See `ParsedTrade` (`lib/parsers/types.ts`) — captured but not yet factored into cost-basis math. */
  exchangeRate?: number;
  brokerage?: number;
};

export type EquityMetadata = {
  /** Free-text, e.g. "NASDAQ" — for display only; Finnhub's `/quote` doesn't need it for a US ticker. */
  exchange: string;
  last_unit_price: number | null;
  last_priced_at: string | null;
  last_price_source: string | null;
  /** Every lot on record for this asset, newest import appended — see `EquityTrade`. */
  trades: EquityTrade[];
};

export const EMPTY_EQUITY_METADATA: EquityMetadata = {
  exchange: "",
  last_unit_price: null,
  last_priced_at: null,
  last_price_source: null,
  trades: [],
};

/**
 * Weighted average cost of the buy lots in `trades` — used both server-side
 * (a fresh import's placeholder `current_value`, before "Refresh Market
 * Price" ever runs, in `dashboard/actions.ts`'s `importBrokerTrades`) and
 * client-side (the "Average Cost Basis" figure on the Equity Details card
 * in `asset-detail-view.tsx`), so both stay in exact agreement rather than
 * risking two copies of this math drifting apart. Deliberately never
 * presented as a live quote — see `last_unit_price` for that. Falls back to
 * the average price across every trade (including sells) only when there
 * are no buy lots at all — an edge case (a sell-only import for an
 * instrument this app has no prior record of), not the common path.
 */
export function estimateCostBasisUnitPrice(
  trades: { side: "buy" | "sell"; quantity: number; price: number }[],
): number | null {
  const buys = trades.filter((t) => t.side === "buy");
  const totalBuyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
  if (totalBuyQty > 0) {
    const totalBuyCost = buys.reduce((sum, t) => sum + t.quantity * t.price, 0);
    return totalBuyCost / totalBuyQty;
  }

  const totalQty = trades.reduce((sum, t) => sum + t.quantity, 0);
  if (totalQty === 0) return null;
  const totalCost = trades.reduce((sum, t) => sum + t.quantity * t.price, 0);
  return totalCost / totalQty;
}

/**
 * Merges a raw `assets.metadata` value into a complete `EquityMetadata`,
 * same defensive pattern as `parseRealEstateMetadata`.
 */
export function parseEquityMetadata(raw: unknown): EquityMetadata {
  if (!raw || typeof raw !== "object") {
    return EMPTY_EQUITY_METADATA;
  }

  const r = raw as Partial<EquityMetadata>;

  return {
    ...EMPTY_EQUITY_METADATA,
    ...r,
    trades: Array.isArray(r.trades) ? r.trades : EMPTY_EQUITY_METADATA.trades,
  };
}
