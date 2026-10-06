import { describe, expect, it } from "vitest";
import { aggregateTrades, BROKER_REGISTRY, BROKERS, getBroker, tradeId } from "./broker-registry";
import type { ParsedTrade } from "./types";

const trade = (over: Partial<ParsedTrade> = {}): ParsedTrade => ({
  instrumentSymbol: "AMZN:XNAS",
  ticker: "AMZN",
  exchange: "XNAS",
  instrumentName: "Amazon",
  currency: "USD",
  tradeDate: "2026-01-10",
  side: "buy",
  quantity: 10,
  price: 100,
  ...over,
});

describe("registry", () => {
  it("exposes saxo and sharesight with consistent ids", () => {
    expect(BROKERS.map((b) => b.id).sort()).toEqual(["saxo", "sharesight"]);
    for (const [key, def] of Object.entries(BROKER_REGISTRY)) {
      expect(def.id).toBe(key);
      expect(def.acceptedExtensions.length).toBeGreaterThan(0);
      expect(typeof def.parse).toBe("function");
    }
  });

  it("getBroker returns the matching definition", () => {
    expect(getBroker("saxo").name).toBe("Saxo Bank");
    expect(getBroker("sharesight").name).toBe("Sharesight");
  });
});

describe("aggregateTrades", () => {
  it("returns no holdings for no trades", () => {
    expect(aggregateTrades([])).toEqual([]);
  });

  it("nets buys and sells into a single holding", () => {
    const [h] = aggregateTrades([
      trade({ quantity: 10 }),
      trade({ quantity: 4, side: "sell" }),
      trade({ quantity: 2.5 }),
    ]);
    expect(h.netQuantity).toBe(8.5);
    expect(h.trades).toHaveLength(3);
  });

  it("allows a net-short / fully closed position", () => {
    const [closed] = aggregateTrades([trade({ quantity: 5 }), trade({ quantity: 5, side: "sell" })]);
    expect(closed.netQuantity).toBe(0);
    const [short] = aggregateTrades([trade({ quantity: 3, side: "sell" })]);
    expect(short.netQuantity).toBe(-3);
  });

  it("keeps the same ticker on different exchanges apart", () => {
    const out = aggregateTrades([trade({ exchange: "XNAS" }), trade({ exchange: "XLON" })]);
    expect(out).toHaveLength(2);
  });

  it("merges trades with no exchange by ticker and keeps them apart from exchange-keyed ones", () => {
    const out = aggregateTrades([
      trade({ exchange: null }),
      trade({ exchange: null, quantity: 1 }),
      trade({ exchange: "XNAS" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((h) => h.exchange === null)?.netQuantity).toBe(11);
  });

  it("takes the first trade's metadata and backfills a missing isin", () => {
    const [h] = aggregateTrades([
      trade({ instrumentName: "First", isin: undefined }),
      trade({ instrumentName: "Second", isin: "US0231351067" }),
    ]);
    expect(h.instrumentName).toBe("First");
    expect(h.isin).toBe("US0231351067");
  });

  it("does not overwrite an existing isin", () => {
    const [h] = aggregateTrades([trade({ isin: "A" }), trade({ isin: "B" })]);
    expect(h.isin).toBe("A");
  });

  it("preserves first-seen holding order", () => {
    const out = aggregateTrades([
      trade({ ticker: "B", exchange: null }),
      trade({ ticker: "A", exchange: null }),
      trade({ ticker: "B", exchange: null }),
    ]);
    expect(out.map((h) => h.ticker)).toEqual(["B", "A"]);
  });
});

describe("tradeId", () => {
  it("is deterministic for the same trade", () => {
    expect(tradeId(trade())).toBe(tradeId(trade()));
  });

  it("changes with date, side, quantity, price, ticker and exchange", () => {
    const base = tradeId(trade());
    expect(tradeId(trade({ tradeDate: "2026-01-11" }))).not.toBe(base);
    expect(tradeId(trade({ side: "sell" }))).not.toBe(base);
    expect(tradeId(trade({ quantity: 11 }))).not.toBe(base);
    expect(tradeId(trade({ price: 101 }))).not.toBe(base);
    expect(tradeId(trade({ ticker: "MSFT" }))).not.toBe(base);
    expect(tradeId(trade({ exchange: null }))).not.toBe(base);
  });

  it("ignores fields that are not part of the identity (name, currency, fees)", () => {
    expect(tradeId(trade({ instrumentName: "Other", brokerage: 5 }))).toBe(tradeId(trade()));
  });
});
