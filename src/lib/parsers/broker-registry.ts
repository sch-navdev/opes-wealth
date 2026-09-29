/**
 * Broker Trade Import (Phase 2, `tracker/Broker-Trade-Import.md`) — the
 * extensible registry of broker parsers. Adding a new broker later means
 * writing one `BrokerDefinition` (a `parse()` function returning the shared
 * `BrokerParseResult` shape from `types.ts`) and adding it here; nothing
 * else downstream (the upload UI, `aggregateTrades`, `importBrokerTrades`)
 * needs to change.
 */
import { parseSaxoWorkbook } from "./saxo";
import { parseSharesightWorkbook } from "./sharesight";
import type { AggregatedHolding, BrokerParseResult, ParsedTrade } from "./types";

export type BrokerId = "saxo" | "sharesight";

export type BrokerDefinition = {
  id: BrokerId;
  name: string;
  /** Single-letter/short fallback shown in a card avatar — no logo image assets in this app yet. */
  logoInitial: string;
  acceptedExtensions: string[];
  parse: (buffer: ArrayBuffer, fileName: string) => BrokerParseResult;
};

export const BROKER_REGISTRY: Record<BrokerId, BrokerDefinition> = {
  saxo: {
    id: "saxo",
    name: "Saxo Bank",
    logoInitial: "S",
    acceptedExtensions: [".xlsx", ".csv"],
    parse: parseSaxoWorkbook,
  },
  sharesight: {
    id: "sharesight",
    name: "Sharesight",
    logoInitial: "SH",
    acceptedExtensions: [".xlsx", ".csv"],
    parse: parseSharesightWorkbook,
  },
};

export const BROKERS: BrokerDefinition[] = Object.values(BROKER_REGISTRY);

export function getBroker(id: BrokerId): BrokerDefinition {
  return BROKER_REGISTRY[id];
}

/**
 * Nets every trade for the same instrument (buy quantities minus sell
 * quantities) into one holding per instrument. Instruments are keyed by
 * `ticker:exchange` when an exchange is known (so the same ticker on two
 * exchanges doesn't merge), falling back to just the ticker otherwise.
 */
export function aggregateTrades(trades: ParsedTrade[]): AggregatedHolding[] {
  const holdings = new Map<string, AggregatedHolding>();

  for (const trade of trades) {
    const key = trade.exchange ? `${trade.ticker}:${trade.exchange}` : trade.ticker;
    const signedQuantity = trade.side === "buy" ? trade.quantity : -trade.quantity;

    const existing = holdings.get(key);
    if (existing) {
      existing.netQuantity += signedQuantity;
      existing.trades.push(trade);
    } else {
      holdings.set(key, {
        ticker: trade.ticker,
        exchange: trade.exchange,
        instrumentName: trade.instrumentName,
        currency: trade.currency,
        netQuantity: signedQuantity,
        trades: [trade],
      });
    }
  }

  return Array.from(holdings.values());
}

/**
 * A deterministic composite key for one trade, used to dedupe against
 * `EquityMetadata.trades` on re-import — the same broker row always
 * produces the same id, so re-uploading an export that overlaps a previous
 * one appends only the genuinely new trades instead of double-counting.
 * Not a cryptographic hash, just a stable string; two distinct real trades
 * colliding would require an identical ticker/date/side/quantity/price,
 * which is an intentional feature here (that combination re-appearing *is*
 * the duplicate this is meant to catch).
 */
export function tradeId(trade: ParsedTrade): string {
  return [
    trade.ticker,
    trade.exchange ?? "",
    trade.tradeDate,
    trade.side,
    trade.quantity,
    trade.price,
  ].join("|");
}
