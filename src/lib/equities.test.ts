import { describe, expect, it } from "vitest";
import {
  EMPTY_EQUITY_METADATA,
  accountDisplayName,
  buildInvestedCapitalSeries,
  buildMarketValueSeries,
  computeHoldingMetrics,
  estimateCostBasisUnitPrice,
  holdingDisplayName,
  isClosedPosition,
  normalizeExchange,
  parseEquityMetadata,
  summarizeClosedPosition,
  tradeCost,
  type EquityMetadata,
  type EquityTrade,
} from "@/lib/equities";

let seq = 0;
const trade = (
  tradeDate: string,
  side: "buy" | "sell",
  quantity: number,
  price: number,
  over: Partial<EquityTrade> = {},
): EquityTrade => ({
  id: `t${++seq}`,
  tradeDate,
  side,
  quantity,
  price,
  currency: "USD",
  source: "manual",
  ...over,
});

const metaOf = (over: Partial<EquityMetadata> = {}): EquityMetadata => ({ ...EMPTY_EQUITY_METADATA, ...over });

describe("tradeCost", () => {
  it("is quantity x price when there is no booked amount", () => {
    expect(tradeCost({ quantity: 10, price: 10 })).toBe(100);
  });

  it("uses the broker's booked amount when it is plausible (within 0.5x..2x)", () => {
    expect(tradeCost({ quantity: 10, price: 10, bookedAmount: 120 })).toBe(120);
    expect(tradeCost({ quantity: 10, price: 10, bookedAmount: 50 })).toBe(50); // ratio exactly 0.5
    expect(tradeCost({ quantity: 10, price: 10, bookedAmount: 200 })).toBe(200); // ratio exactly 2
  });

  it("ignores a booked amount that is more than 2x or under half the gross (likely another currency)", () => {
    expect(tradeCost({ quantity: 10, price: 10, bookedAmount: 201 })).toBe(100);
    expect(tradeCost({ quantity: 10, price: 10, bookedAmount: 49 })).toBe(100);
    expect(tradeCost({ quantity: 10, price: 10, bookedAmount: 10_000 })).toBe(100);
  });

  it("ignores zero/negative booked amounts and zero gross", () => {
    expect(tradeCost({ quantity: 10, price: 10, bookedAmount: 0 })).toBe(100);
    expect(tradeCost({ quantity: 10, price: 10, bookedAmount: -100 })).toBe(100);
    expect(tradeCost({ quantity: 0, price: 10, bookedAmount: 100 })).toBe(0);
    expect(tradeCost({ quantity: 10, price: 0, bookedAmount: 100 })).toBe(0);
  });
});

describe("buildInvestedCapitalSeries", () => {
  it("returns [] for no trades", () => {
    expect(buildInvestedCapitalSeries([])).toEqual([]);
  });

  it("accumulates buys: cost basis steps up on each trade date", () => {
    const s = buildInvestedCapitalSeries([trade("2024-01-01", "buy", 10, 10), trade("2024-02-01", "buy", 10, 20)]);
    expect(s).toEqual([
      { date: "2024-01-01", value: 100 },
      { date: "2024-02-01", value: 300 },
    ]);
  });

  it("a sell removes cost at the running average, not at the sale price", () => {
    const s = buildInvestedCapitalSeries([
      trade("2024-01-01", "buy", 10, 10),
      trade("2024-02-01", "buy", 10, 20), // 20 shares, cost 300, avg 15
      trade("2024-03-01", "sell", 10, 100), // sells at a big profit: still removes 10 x 15 = 150
    ]);
    expect(s.map((p) => p.value)).toEqual([100, 300, 150]);
  });

  it("selling everything takes the cost basis to 0", () => {
    const s = buildInvestedCapitalSeries([trade("2024-01-01", "buy", 5, 10), trade("2024-02-01", "sell", 5, 12)]);
    expect(s[1].value).toBeCloseTo(0, 10);
  });

  it("one point per date; same-day trades net out, with buys processed before sells", () => {
    // Sell listed first but dated the same day: the buy must be applied first or the sell is lost.
    const s = buildInvestedCapitalSeries([
      trade("2024-01-01", "buy", 10, 10),
      trade("2024-02-01", "sell", 10, 10),
      trade("2024-02-01", "buy", 10, 10),
    ]);
    expect(s).toEqual([
      { date: "2024-01-01", value: 100 },
      { date: "2024-02-01", value: 100 },
    ]);
  });

  it("sorts unordered input by date and does not mutate it", () => {
    const input = [trade("2024-02-01", "buy", 1, 50), trade("2024-01-01", "buy", 1, 10)];
    const copy = [...input];
    expect(buildInvestedCapitalSeries(input)).toEqual([
      { date: "2024-01-01", value: 10 },
      { date: "2024-02-01", value: 60 },
    ]);
    expect(input).toEqual(copy);
  });

  it("an over-sell cannot take the cost basis below zero or sell more than is held", () => {
    const s = buildInvestedCapitalSeries([trade("2024-01-01", "buy", 5, 10), trade("2024-02-01", "sell", 50, 10)]);
    expect(s[1].value).toBeCloseTo(0, 10);
  });

  it("a sell with no prior position is ignored (cost stays 0)", () => {
    const s = buildInvestedCapitalSeries([trade("2024-01-01", "sell", 5, 10)]);
    expect(s).toEqual([{ date: "2024-01-01", value: 0 }]);
  });

  it("uses the booked amount for the cost when plausible", () => {
    const s = buildInvestedCapitalSeries([trade("2024-01-01", "buy", 10, 10, { bookedAmount: 105 })]);
    expect(s[0].value).toBe(105);
  });
});

describe("isClosedPosition", () => {
  it("true for 0, negative and NaN; false for any positive quantity", () => {
    expect(isClosedPosition(0)).toBe(true);
    expect(isClosedPosition(-1)).toBe(true);
    expect(isClosedPosition(NaN)).toBe(true);
    expect(isClosedPosition(0.0001)).toBe(false);
    expect(isClosedPosition(100)).toBe(false);
  });
});

describe("summarizeClosedPosition", () => {
  it("computes invested, proceeds, realized result and return incl. dividends", () => {
    const r = summarizeClosedPosition(
      [trade("2024-01-05", "buy", 10, 10), trade("2024-06-01", "sell", 10, 15)],
      5,
    );
    expect(r).toMatchObject({
      opened: "2024-01-05",
      closed: "2024-06-01",
      invested: 100,
      proceeds: 150,
      realized: 50,
      income: 5,
    });
    expect(r.returnPct).toBeCloseTo(55, 10);
  });

  it("opened is the earliest buy and closed the latest sell, whatever the input order", () => {
    const r = summarizeClosedPosition(
      [
        trade("2024-09-01", "sell", 5, 12),
        trade("2024-03-01", "buy", 5, 10),
        trade("2024-01-01", "buy", 5, 10),
        trade("2024-05-01", "sell", 5, 11),
      ],
      0,
    );
    expect(r.opened).toBe("2024-01-01");
    expect(r.closed).toBe("2024-09-01");
    expect(r.invested).toBe(100);
    expect(r.proceeds).toBe(115);
  });

  it("a loss gives a negative realized result and return", () => {
    const r = summarizeClosedPosition([trade("2024-01-01", "buy", 10, 10), trade("2024-02-01", "sell", 10, 8)], 0);
    expect(r.realized).toBe(-20);
    expect(r.returnPct).toBeCloseTo(-20, 10);
  });

  it("no trades: nulls and zeros, no division by zero", () => {
    expect(summarizeClosedPosition([], 0)).toEqual({
      opened: null,
      closed: null,
      invested: 0,
      proceeds: 0,
      realized: 0,
      income: 0,
      returnPct: null,
    });
  });

  it("returnPct is null when nothing was invested (sell-only ledger) but dates still fall back", () => {
    const r = summarizeClosedPosition([trade("2024-02-01", "sell", 10, 8)], 3);
    expect(r.returnPct).toBeNull();
    expect(r.opened).toBe("2024-02-01");
    expect(r.closed).toBe("2024-02-01");
  });
});

describe("holdingDisplayName", () => {
  it("prefers the stored instrument name", () => {
    expect(holdingDisplayName("Anything", { instrument_name: "Apple Inc." }, "AAPL")).toBe("Apple Inc.");
  });

  it("keeps a proper asset name", () => {
    expect(holdingDisplayName("Apple", {}, "AAPL")).toBe("Apple");
  });

  it("legacy 'Brokerage Account / ...' names fall back to the ticker, then the last path segment", () => {
    const legacy = "Brokerage Account / Saxobank Acc. # 123 / UBIP";
    expect(holdingDisplayName(legacy, {}, "UBI")).toBe("UBI");
    expect(holdingDisplayName(legacy, {}, null)).toBe("UBIP");
    expect(holdingDisplayName(legacy, { instrument_name: "Ubisoft" }, "UBI")).toBe("Ubisoft");
  });
});

describe("accountDisplayName", () => {
  it("returns the account label, stripping the legacy prefix", () => {
    expect(accountDisplayName({ account_name: "Saxobank Acc. # 10164571" })).toBe("Saxobank Acc. # 10164571");
    expect(accountDisplayName({ account_name: "Brokerage Account / Saxobank Acc. # 1" })).toBe("Saxobank Acc. # 1");
  });

  it("null when missing, empty, or only the prefix", () => {
    expect(accountDisplayName({})).toBeNull();
    expect(accountDisplayName({ account_name: "" })).toBeNull();
    expect(accountDisplayName({ account_name: "Brokerage Account /   " })).toBeNull();
  });
});

describe("normalizeExchange", () => {
  it.each([
    ["XNAS", "NASDAQ"],
    ["Nasdaq Global Select", "NASDAQ"],
    ["XNYS", "NYSE"],
    ["New York Stock Exchange", "NYSE"],
    ["XPAR", "EURONEXT"],
    ["Euronext Amsterdam", "EURONEXT"],
    ["XLON", "LSE"],
    ["London Stock Exchange", "LSE"],
    ["XETR", "XETRA"],
    ["Deutsche Boerse", "XETRA"],
    ["XMIL", "BORSA ITALIANA"],
    ["XSWX", "SIX"],
    ["XTSE", "TSX"],
    ["XASX", "ASX"],
    ["XTKS", "TSE"],
    ["XHKG", "HKEX"],
    ["XADS", "ADX"],
    ["XDFM", "DFM"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeExchange(raw)).toBe(expected);
  });

  it("is case-insensitive and trims", () => {
    expect(normalizeExchange("  xpar ")).toBe("EURONEXT");
  });

  it("an empty/null/undefined value is OTHER", () => {
    expect(normalizeExchange("")).toBe("OTHER");
    expect(normalizeExchange("   ")).toBe("OTHER");
    expect(normalizeExchange(null)).toBe("OTHER");
    expect(normalizeExchange(undefined)).toBe("OTHER");
  });

  it("an unrecognised code falls back to the trimmed upper-cased raw value", () => {
    expect(normalizeExchange(" bvmf ")).toBe("BVMF");
  });
});

describe("estimateCostBasisUnitPrice", () => {
  it("is the quantity-weighted average buy price", () => {
    expect(
      estimateCostBasisUnitPrice([
        { side: "buy", quantity: 10, price: 10 },
        { side: "buy", quantity: 30, price: 20 },
      ]),
    ).toBeCloseTo(17.5, 12); // (100 + 600) / 40
  });

  it("ignores sells when there are buy lots", () => {
    expect(
      estimateCostBasisUnitPrice([
        { side: "buy", quantity: 10, price: 10 },
        { side: "sell", quantity: 5, price: 1000 },
      ]),
    ).toBe(10);
  });

  it("falls back to the average over all trades when there are only sells", () => {
    expect(
      estimateCostBasisUnitPrice([
        { side: "sell", quantity: 10, price: 5 },
        { side: "sell", quantity: 10, price: 7 },
      ]),
    ).toBe(6);
  });

  it("null with no trades or zero total quantity", () => {
    expect(estimateCostBasisUnitPrice([])).toBeNull();
    expect(estimateCostBasisUnitPrice([{ side: "sell", quantity: 0, price: 5 }])).toBeNull();
  });
});

describe("computeHoldingMetrics", () => {
  const trades = [trade("2024-01-01", "buy", 10, 10), trade("2024-02-01", "buy", 10, 20)]; // avg 15

  it("cost = shares held x average buy price; gain and return follow", () => {
    const m = computeHoldingMetrics({
      quantity: 20,
      currentValue: 400,
      metadata: metaOf({ trades, last_unit_price: 20 }),
    });
    expect(m.cost).toBe(300);
    expect(m.capitalGain).toBe(100);
    expect(m.income).toBe(0);
    expect(m.returnPct).toBeCloseTo(33.3333333, 5);
    expect(m.price).toBe(20);
  });

  it("includes itemised income in the return", () => {
    const m = computeHoldingMetrics({
      quantity: 20,
      currentValue: 400,
      metadata: metaOf({ trades, income: [{ date: "2024-03-01", amount: 12 }, { date: "2024-04-01", amount: 8 }] }),
    });
    expect(m.income).toBe(20);
    expect(m.returnPct).toBeCloseTo(40, 10); // (100 + 20) / 300
  });

  it("falls back to total_income when nothing is itemised", () => {
    const m = computeHoldingMetrics({ quantity: 20, currentValue: 400, metadata: metaOf({ trades, total_income: 30 }) });
    expect(m.income).toBe(30);
    expect(m.returnPct).toBeCloseTo(43.3333333, 5);
  });

  it("itemised income takes priority over total_income", () => {
    const m = computeHoldingMetrics({
      quantity: 20,
      currentValue: 400,
      metadata: metaOf({ trades, income: [{ date: "2024-03-01", amount: 5 }], total_income: 999 }),
    });
    expect(m.income).toBe(5);
  });

  it("no trades: no cost basis, so no gain or return", () => {
    const m = computeHoldingMetrics({ quantity: 20, currentValue: 400, metadata: metaOf() });
    expect(m.cost).toBeNull();
    expect(m.capitalGain).toBeNull();
    expect(m.returnPct).toBeNull();
  });

  it("price falls back: last quote, then previous close, then value / quantity, else null", () => {
    expect(computeHoldingMetrics({ quantity: 10, currentValue: 500, metadata: metaOf({ last_unit_price: 55, previous_close: 40 }) }).price).toBe(55);
    expect(computeHoldingMetrics({ quantity: 10, currentValue: 500, metadata: metaOf({ previous_close: 40 }) }).price).toBe(40);
    expect(computeHoldingMetrics({ quantity: 10, currentValue: 500, metadata: metaOf() }).price).toBe(50);
    expect(computeHoldingMetrics({ quantity: 0, currentValue: 0, metadata: metaOf() }).price).toBeNull();
  });

  it("a closed position (0 shares) has zero cost and a null return", () => {
    const m = computeHoldingMetrics({ quantity: 0, currentValue: 0, metadata: metaOf({ trades }) });
    expect(m.cost).toBe(0);
    expect(m.capitalGain).toBe(0);
    expect(m.returnPct).toBeNull();
  });

  it("a negative quantity does not produce a negative cost", () => {
    expect(computeHoldingMetrics({ quantity: -5, currentValue: 0, metadata: metaOf({ trades }) }).cost).toBe(0);
  });

  it("a losing position has a negative gain and return", () => {
    const m = computeHoldingMetrics({ quantity: 20, currentValue: 150, metadata: metaOf({ trades }) });
    expect(m.capitalGain).toBe(-150);
    expect(m.returnPct).toBeCloseTo(-50, 10);
  });
});

describe("buildMarketValueSeries", () => {
  const closes = [
    { date: "2024-01-01", close: 5 },
    { date: "2024-01-02", close: 10 },
    { date: "2024-01-03", close: 11 },
    { date: "2024-01-04", close: 12 },
  ];

  it("null with no closes or no trades (caller falls back to cost basis)", () => {
    expect(buildMarketValueSeries([trade("2024-01-02", "buy", 10, 9)], [])).toBeNull();
    expect(buildMarketValueSeries([], closes)).toBeNull();
  });

  it("quantity held x that day's close, starting at the first trade (earlier closes are excluded)", () => {
    const s = buildMarketValueSeries([trade("2024-01-02", "buy", 10, 9)], closes);
    expect(s).toEqual([
      { date: "2024-01-02", value: 100 },
      { date: "2024-01-03", value: 110 },
      { date: "2024-01-04", value: 120 },
    ]);
  });

  it("the trade day's value uses the latest close on or before it", () => {
    // Trade on a non-trading day (weekend) between closes.
    const s = buildMarketValueSeries(
      [trade("2024-01-06", "buy", 2, 9)],
      [
        { date: "2024-01-05", close: 7 },
        { date: "2024-01-08", close: 8 },
      ],
    );
    expect(s).toEqual([
      { date: "2024-01-06", value: 14 },
      { date: "2024-01-08", value: 16 },
    ]);
  });

  it("uses the most recent trade price when no close exists yet", () => {
    const s = buildMarketValueSeries(
      [trade("2024-01-01", "buy", 4, 9)],
      [{ date: "2024-01-05", close: 10 }],
    );
    expect(s).toEqual([
      { date: "2024-01-01", value: 36 },
      { date: "2024-01-05", value: 40 },
    ]);
  });

  it("partial sells reduce the quantity from that date on", () => {
    const s = buildMarketValueSeries(
      [trade("2024-01-02", "buy", 10, 9), trade("2024-01-03", "sell", 4, 11)],
      closes,
    );
    expect(s).toEqual([
      { date: "2024-01-02", value: 100 },
      { date: "2024-01-03", value: 66 }, // 6 x 11
      { date: "2024-01-04", value: 72 }, // 6 x 12
    ]);
  });

  it("emits a single zero on the day the position is fully sold, then nothing", () => {
    const s = buildMarketValueSeries(
      [trade("2024-01-02", "buy", 10, 9), trade("2024-01-03", "sell", 10, 11)],
      closes,
    );
    expect(s).toEqual([
      { date: "2024-01-02", value: 100 },
      { date: "2024-01-03", value: 0 },
    ]);
  });

  it("never lets the running quantity go negative on an over-sell", () => {
    const s = buildMarketValueSeries(
      [trade("2024-01-02", "buy", 5, 9), trade("2024-01-03", "sell", 50, 11)],
      closes,
    );
    expect(s?.every((p) => p.value >= 0)).toBe(true);
    expect(s?.[s.length - 1]).toEqual({ date: "2024-01-03", value: 0 });
  });
});

describe("parseEquityMetadata", () => {
  it("returns the defaults for null / non-objects", () => {
    expect(parseEquityMetadata(null)).toEqual(EMPTY_EQUITY_METADATA);
    expect(parseEquityMetadata("x")).toEqual(EMPTY_EQUITY_METADATA);
  });

  it("merges stored fields and repairs a non-array trades", () => {
    const p = parseEquityMetadata({ exchange: "NASDAQ", trades: "bad" });
    expect(p.exchange).toBe("NASDAQ");
    expect(p.trades).toEqual([]);
    expect(p.last_unit_price).toBeNull();
  });

  it("keeps valid trades", () => {
    const t = [trade("2024-01-01", "buy", 1, 1)];
    expect(parseEquityMetadata({ trades: t }).trades).toEqual(t);
  });
});
