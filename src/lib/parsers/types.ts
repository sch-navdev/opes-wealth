/**
 * Broker Trade Import (Phase 2, `tracker/Broker-Trade-Import.md`). Shared
 * types for every broker parser in `broker-registry.ts` — a new broker
 * (beyond Saxo Bank) implements `BrokerDefinition.parse` returning this
 * same `ParsedTrade[]` shape, so the aggregation/upload UI/server action
 * downstream of parsing never needs to know which broker a trade came from.
 */

export type TradeSide = "buy" | "sell";

export type ParsedTrade = {
  /** The raw instrument identifier as the broker exports it, e.g. "AMZN:xnas". */
  instrumentSymbol: string;
  /** Just the ticker, e.g. "AMZN" — exchange suffix stripped. */
  ticker: string;
  /** Exchange/MIC code, e.g. "XNAS", if the broker's symbol encodes one. */
  exchange: string | null;
  instrumentName: string;
  /** ISO 4217 currency code, e.g. "USD". */
  currency: string;
  /** ISO `YYYY-MM-DD`. */
  tradeDate: string;
  side: TradeSide;
  /** Always a positive magnitude — `side` carries the direction. */
  quantity: number;
  price: number;
  /**
   * FX rate applied to this trade and any brokerage/commission fee paid,
   * both optional since no parser (Saxo, generic CSV, manual entry)
   * currently reads these from a source file — brokers don't consistently
   * report either per trade. Filled with UI defaults once a trade lands in
   * `add-investments-dialog.tsx`'s own state, editable there before import,
   * and persisted onto `EquityTrade` (`lib/equities.ts`) — not yet factored
   * into `estimateCostBasisUnitPrice` (`dashboard/actions.ts`).
   */
  exchangeRate?: number;
  brokerage?: number;
  /** Absolute cash cost (buy) / proceeds (sell) including commission, from the broker's `Booked Amount` column when the export has one. Preferred over `quantity × price` for invested-capital history (see `tradeCost` in `lib/equities.ts`). */
  bookedAmount?: number;
  /** The broker's own trade id, used to join a trade to its Transactions-sheet row. */
  brokerTradeId?: string;
  /** ISIN of the instrument (Saxo `Instrument ISIN`), e.g. `FR0000054470`. */
  isin?: string;
};

/** One cash dividend/income receipt from a broker export, in the currency it was booked in. */
export type ParsedIncome = {
  /** `TICKER:EXCHANGE` (upper-case), matching `aggregateTrades`' holding key, so it can be attached to a holding. */
  key: string;
  ticker: string;
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** Signed booked amount (net of withholding tax for Saxo). */
  amount: number;
  currency: string;
  /** Broker's stable record id, for de-duplicating re-imports. */
  id?: string;
};

export type ParsedTradeRowError = {
  /** 0-based, matches the row's position in the source sheet/file (excluding header rows). */
  rowIndex: number;
  message: string;
};

export type BrokerParseResult = {
  trades: ParsedTrade[];
  errors: ParsedTradeRowError[];
  /**
   * Rows silently excluded because they weren't an executed trade at all —
   * e.g. a Sharesight Watchlist entry, or a trade later cancelled/left
   * unconfirmed. Not a row error (nothing is malformed about the row), so
   * it's counted separately; `undefined` for parsers with no such concept.
   */
  skippedNonTradeCount?: number;
  /** The brokerage account/client number found in the file (Saxo `Client ID`/`Account ID`), used to name the generated asset. */
  accountId?: string;
  /** Cash dividends found in the file (Saxo Transactions sheet, `Event` = "Cash dividend"), summed per holding into the Income column. */
  dividends?: ParsedIncome[];
};

/** One instrument's net position across every trade an import contained. */
export type AggregatedHolding = {
  ticker: string;
  exchange: string | null;
  instrumentName: string;
  currency: string;
  /** ISIN, when the broker export carries one. */
  isin?: string;
  /** Sum of buy quantities minus sell quantities across `trades`. */
  netQuantity: number;
  trades: ParsedTrade[];
};
