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
  /** Broker-reported total cost/proceeds (Saxo `Total cost`/`Booked Amount`), when present. */
  bookedAmount?: number;
};

/** One dividend/income receipt against this holding (asset currency). No automatic source yet — filled manually — so the table's Income column is honestly `—` until entries exist. */
export type EquityIncome = { date: string; amount: number };

/**
 * Cost of a buy (or proceeds of a sell): the broker's booked amount when it's
 * present and plausible, otherwise `quantity × price`. A booked amount more
 * than 2× off (or under half of) quantity × price is ignored — it is almost
 * certainly in a different currency/unit, and would corrupt the series.
 */
export function tradeCost(t: {
  quantity: number;
  price: number;
  bookedAmount?: number;
}): number {
  const gross = t.quantity * t.price;
  if (t.bookedAmount && t.bookedAmount > 0 && gross > 0) {
    const ratio = t.bookedAmount / gross;
    if (ratio >= 0.5 && ratio <= 2) return t.bookedAmount;
  }
  return gross;
}

/**
 * Invested capital over time from a trade ledger: for every trade date, the
 * cost basis of the position still held after that day's trades (average-cost
 * method — a sell removes cost at the running average, not at its proceeds).
 * Feeds the `asset_history` backfill so the portfolio chart starts at the
 * earliest trade rather than flatlining at zero until the import date.
 */
export function buildInvestedCapitalSeries(
  trades: EquityTrade[],
): { date: string; value: number }[] {
  const sorted = [...trades].sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      (a.side === b.side ? 0 : a.side === "buy" ? -1 : 1),
  );
  let quantity = 0;
  let cost = 0;
  const byDate = new Map<string, number>();

  for (const trade of sorted) {
    if (trade.side === "buy") {
      quantity += trade.quantity;
      cost += tradeCost(trade);
    } else if (quantity > 0) {
      const sold = Math.min(trade.quantity, quantity);
      cost -= (cost / quantity) * sold;
      quantity -= sold;
    }
    byDate.set(trade.tradeDate, Math.max(0, cost));
  }

  return Array.from(byDate, ([date, value]) => ({ date, value }));
}

/**
 * What to show as a holding's name. Assets imported before names were
 * cleaned up are called "Brokerage Account / Saxobank Acc. # 123 / UBIP" (an
 * internal path, not a name): for those, fall back to the stored company name
 * (`instrument_name`), then the ticker.
 */
export function holdingDisplayName(
  assetName: string,
  metadata: Pick<EquityMetadata, "instrument_name">,
  ticker: string | null,
): string {
  if (metadata.instrument_name) return metadata.instrument_name;
  if (/^Brokerage Account \//.test(assetName)) return ticker || assetName.split("/").pop()!.trim();
  return assetName;
}

/** "Saxobank Acc. # 10164571" — the account level of the Brokerage Account → account → holding hierarchy. Strips the legacy "Brokerage Account / " prefix older imports stored. */
export function accountDisplayName(metadata: Pick<EquityMetadata, "account_name">): string | null {
  const name = metadata.account_name?.replace(/^Brokerage Account \/\s*/, "").trim();
  return name || null;
}

export type EquityMetadata = {
  /** Brokerage account this holding was imported from (e.g. Saxo Client ID) and its label, e.g. "Saxobank Acc. # 10164571". */
  account_id?: string;
  account_name?: string;
  /** Company/fund name and ISIN from the broker export. */
  instrument_name?: string;
  isin?: string;
  /** Display exchange, normalized by `normalizeExchange` (e.g. "NASDAQ", "EURONEXT"). Drives the brokerage table's exchange grouping. */
  exchange: string;
  last_unit_price: number | null;
  last_priced_at: string | null;
  last_price_source: string | null;
  /** Finnhub `/quote` extras from the last refresh, in the asset's currency. */
  open_price?: number | null;
  previous_close?: number | null;
  day_change_pct?: number | null;
  /** Dividend/income receipts, if any. */
  income?: EquityIncome[];
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

/** Broker/MIC codes and Finnhub profile strings -> the exchange names the brokerage table groups by. Anything unrecognized falls back to the trimmed upper-cased raw value, and an empty value to "OTHER". */
const EXCHANGE_ALIASES: [RegExp, string][] = [
  [/^(XNAS|NASDAQ|XNMS|XNCM|XNGS)/i, "NASDAQ"],
  [/^(XNYS|NYSE|ARCX|XASE|AMEX|NEW YORK STOCK)/i, "NYSE"],
  [/^(XPAR|XAMS|XBRU|XLIS|XMLI|EURONEXT|PARIS|AMSTERDAM|BRUSSELS|LISBON)/i, "EURONEXT"],
  [/^(XLON|LSE|LONDON)/i, "LSE"],
  [/^(XETR|XFRA|XETRA|FRANKFURT|DEUTSCHE)/i, "XETRA"],
  [/^(XMIL|MILAN|BORSA ITALIANA)/i, "BORSA ITALIANA"],
  [/^(XSWX|SIX)/i, "SIX"],
  [/^(XTSE|TSX|TORONTO)/i, "TSX"],
  [/^(XASX|ASX)/i, "ASX"],
  [/^(XTKS|TSE|TOKYO)/i, "TSE"],
  [/^(XHKG|HKEX|HONG KONG)/i, "HKEX"],
  [/^(XADS|ADX|ABU DHABI)/i, "ADX"],
  [/^(XDFM|DFM|DUBAI)/i, "DFM"],
];

export function normalizeExchange(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "OTHER";
  for (const [pattern, name] of EXCHANGE_ALIASES) {
    if (pattern.test(value)) return name;
  }
  return value.toUpperCase();
}

/**
 * The per-holding figures shown in the brokerage table, all in the asset's
 * own currency. Cost uses the average buy cost of the open position
 * (`estimateCostBasisUnitPrice` × shares still held); Capital Gain is value
 * minus that cost; Return is (gain + income) / cost, or `null` when there is
 * no cost basis to divide by. `price` is the last live quote, falling back to
 * value/quantity so a holding never shows a blank or zero price just because
 * it hasn't been refreshed yet.
 */
export function computeHoldingMetrics(input: {
  quantity: number;
  currentValue: number;
  metadata: EquityMetadata;
}) {
  const { quantity, currentValue, metadata } = input;
  const avgCost = estimateCostBasisUnitPrice(metadata.trades);
  const cost = avgCost != null ? Math.max(0, quantity) * avgCost : null;
  // Last live quote, else the stored previous close, else value ÷ quantity
  // (cost basis for a never-priced holding) — so a failed refresh never
  // blanks or zeroes a holding's price.
  const price =
    metadata.last_unit_price ??
    metadata.previous_close ??
    (quantity > 0 ? currentValue / quantity : null);
  const income = (metadata.income ?? []).reduce((sum, i) => sum + i.amount, 0);
  const capitalGain = cost != null ? currentValue - cost : null;
  const returnPct =
    cost != null && cost > 0 && capitalGain != null
      ? ((capitalGain + income) / cost) * 100
      : null;
  return { price, cost, capitalGain, income, returnPct };
}

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
