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
};

export type ParsedTradeRowError = {
  /** 0-based, matches the row's position in the source sheet/file (excluding header rows). */
  rowIndex: number;
  message: string;
};

export type BrokerParseResult = {
  trades: ParsedTrade[];
  errors: ParsedTradeRowError[];
};

/** One instrument's net position across every trade an import contained. */
export type AggregatedHolding = {
  ticker: string;
  exchange: string | null;
  instrumentName: string;
  currency: string;
  /** Sum of buy quantities minus sell quantities across `trades`. */
  netQuantity: number;
  trades: ParsedTrade[];
};
