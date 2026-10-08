import { describe, expect, it } from "vitest";
import {
  buildInvestedCapitalSeries,
  summarizeClosedPosition,
  type EquityTrade,
} from "@/lib/equities";
import {
  LOT_METHODS,
  daysBetween,
  heldTwelveMonths,
  isLotMethod,
  matchLots,
  unitPriceFromHolding,
  type LotMethod,
} from "@/lib/tax-lots";

// Invented fixtures only.
let n = 0;
function trade(
  side: "buy" | "sell",
  tradeDate: string,
  quantity: number,
  price: number,
  extra: Partial<EquityTrade> = {},
): EquityTrade {
  n += 1;
  return { id: `t${n}`, tradeDate, side, quantity, price, currency: "USD", source: "manual", ...extra };
}
const buy = (d: string, q: number, p: number, extra?: Partial<EquityTrade>) => trade("buy", d, q, p, extra);
const sell = (d: string, q: number, p: number, extra?: Partial<EquityTrade>) => trade("sell", d, q, p, extra);

const opts = { currency: "USD", asOf: "2025-01-01" };

/** Three lots at 100 / 150 / 120, then one sale of 15 @ 160 (proceeds 2400). */
function textbook() {
  const b1 = buy("2023-01-10", 10, 100, { id: "b1" });
  const b2 = buy("2023-03-15", 10, 150, { id: "b2" });
  const b3 = buy("2023-06-01", 10, 120, { id: "b3" });
  const s1 = sell("2024-02-01", 15, 160, { id: "s1" });
  return [b1, b2, b3, s1];
}

describe("helpers", () => {
  it("isLotMethod accepts the four methods only", () => {
    expect(LOT_METHODS).toEqual(["fifo", "lifo", "hifo", "average"]);
    for (const m of LOT_METHODS) expect(isLotMethod(m)).toBe(true);
    expect(isLotMethod("FIFO")).toBe(false);
    expect(isLotMethod(null)).toBe(false);
    expect(isLotMethod("specific")).toBe(false);
  });

  it("unitPriceFromHolding is value / quantity, null when nothing is held", () => {
    expect(unitPriceFromHolding(10, 1500)).toBe(150);
    expect(unitPriceFromHolding(0, 1500)).toBeNull();
    expect(unitPriceFromHolding(-1, 1500)).toBeNull();
    expect(unitPriceFromHolding(10, Number.NaN)).toBeNull();
  });

  it("daysBetween counts calendar days (leap years included), never negative", () => {
    expect(daysBetween("2023-01-10", "2024-02-01")).toBe(387);
    expect(daysBetween("2023-03-15", "2024-02-01")).toBe(323);
    expect(daysBetween("2024-02-01", "2024-02-01")).toBe(0);
    expect(daysBetween("2024-02-02", "2024-02-01")).toBe(0);
  });

  it("heldTwelveMonths uses calendar months (29 Feb + 1 year = 1 Mar)", () => {
    expect(heldTwelveMonths("2023-01-10", "2024-01-10")).toBe(true);
    expect(heldTwelveMonths("2023-01-10", "2024-01-09")).toBe(false);
    expect(heldTwelveMonths("2024-02-29", "2025-02-28")).toBe(false);
    expect(heldTwelveMonths("2024-02-29", "2025-03-01")).toBe(true);
    expect(heldTwelveMonths("bad", "2025-03-01")).toBe(false);
  });
});

describe("matchLots: textbook example (the four methods disagree)", () => {
  const expected: Record<LotMethod, { cost: number; gain: number; remaining: number }> = {
    // FIFO: 10 @ 100 + 5 @ 150
    fifo: { cost: 1750, gain: 650, remaining: 1950 },
    // LIFO: 10 @ 120 + 5 @ 150
    lifo: { cost: 1950, gain: 450, remaining: 1750 },
    // HIFO: 10 @ 150 + 5 @ 120
    hifo: { cost: 2100, gain: 300, remaining: 1600 },
    // Average: 15 x (3700 / 30)
    average: { cost: 1850, gain: 550, remaining: 1850 },
  };

  for (const method of LOT_METHODS) {
    it(`${method}: realised gain, remaining cost basis and open quantity`, () => {
      const r = matchLots(textbook(), method, opts);
      expect(r.method).toBe(method);
      expect(r.totalProceeds).toBeCloseTo(2400, 8);
      expect(r.totalRealisedCost).toBeCloseTo(expected[method].cost, 8);
      expect(r.totalRealised).toBeCloseTo(expected[method].gain, 8);
      expect(r.remainingCost).toBeCloseTo(expected[method].remaining, 8);
      expect(r.openQuantity).toBeCloseTo(15, 10);
      expect(r.warnings).toEqual([]);
      expect(r.tradesUsed).toBe(4);
      // remaining cost + realised cost = everything ever bought
      expect(r.remainingCost + r.totalRealisedCost).toBeCloseTo(3700, 8);
    });
  }

  it("FIFO consumes the oldest lot fully, then part of the next (partial lot)", () => {
    const r = matchLots(textbook(), "fifo", opts);
    expect(r.matches.map((m) => [m.buyTradeId, m.quantity])).toEqual([
      ["b1", 10],
      ["b2", 5],
    ]);
    expect(r.matches[0]).toMatchObject({ sellTradeId: "s1", sellDate: "2024-02-01", lotDate: "2023-01-10", holdingDays: 387, heldOverYear: true });
    expect(r.matches[0].proceeds).toBeCloseTo(1600, 8);
    expect(r.matches[0].cost).toBeCloseTo(1000, 8);
    expect(r.matches[0].gain).toBeCloseTo(600, 8);
    expect(r.matches[1]).toMatchObject({ lotDate: "2023-03-15", holdingDays: 323, heldOverYear: false });
    expect(r.matches[1].gain).toBeCloseTo(50, 8);

    expect(r.openLots.map((l) => [l.buyTradeId, l.quantity, l.originalQuantity])).toEqual([
      ["b2", 5, 10],
      ["b3", 10, 10],
    ]);
    expect(r.openLots[0].unitCost).toBeCloseTo(150, 10);
    expect(r.openLots[0].cost).toBeCloseTo(750, 8);
  });

  it("LIFO takes the newest lot first", () => {
    const r = matchLots(textbook(), "lifo", opts);
    expect(r.matches.map((m) => [m.buyTradeId, m.quantity])).toEqual([
      ["b3", 10],
      ["b2", 5],
    ]);
    expect(r.openLots.map((l) => [l.buyTradeId, l.quantity])).toEqual([
      ["b1", 10],
      ["b2", 5],
    ]);
  });

  it("HIFO takes the highest unit cost first and keeps open lots in purchase order", () => {
    const r = matchLots(textbook(), "hifo", opts);
    expect(r.matches.map((m) => [m.buyTradeId, m.quantity])).toEqual([
      ["b2", 10],
      ["b3", 5],
    ]);
    expect(r.openLots.map((l) => [l.buyTradeId, l.quantity])).toEqual([
      ["b1", 10],
      ["b3", 5],
    ]);
  });

  it("average: costs at the pool average, holding periods oldest-first, open lots carry the average", () => {
    const r = matchLots(textbook(), "average", opts);
    expect(r.matches.map((m) => [m.buyTradeId, m.quantity])).toEqual([
      ["b1", 10],
      ["b2", 5],
    ]);
    expect(r.matches[0].cost).toBeCloseTo((3700 / 30) * 10, 8);
    expect(r.matches[1].cost).toBeCloseTo((3700 / 30) * 5, 8);
    for (const lot of r.openLots) expect(lot.unitCost).toBeCloseTo(3700 / 30, 8);
    expect(r.openLots.reduce((s, l) => s + l.cost, 0)).toBeCloseTo(1850, 8);
  });

  it("realised gain by year and unrealised gain with a current price", () => {
    const r = matchLots(textbook(), "fifo", { ...opts, currentUnitPrice: 200 });
    expect(r.realisedByYear).toHaveLength(1);
    expect(r.realisedByYear[0].year).toBe(2024);
    expect(r.realisedByYear[0].gain).toBeCloseTo(650, 8);
    expect(r.currentUnitPrice).toBe(200);
    expect(r.marketValue).toBeCloseTo(3000, 8);
    expect(r.unrealisedGain).toBeCloseTo(1050, 8);
    expect(r.openLots[0].value).toBeCloseTo(1000, 8);
    expect(r.openLots[0].unrealisedGain).toBeCloseTo(250, 8);
    expect(r.openLots[1].unrealisedGain).toBeCloseTo(800, 8);
  });

  it("without a price, unrealised figures are null", () => {
    const r = matchLots(textbook(), "fifo", opts);
    expect(r.currentUnitPrice).toBeNull();
    expect(r.marketValue).toBeNull();
    expect(r.unrealisedGain).toBeNull();
    expect(r.openLots.every((l) => l.value === null && l.unrealisedGain === null)).toBe(true);
  });

  it("open lots' held days and the 12-month marker are measured to asOf", () => {
    const r = matchLots(textbook(), "fifo", { currency: "USD", asOf: "2024-03-20" });
    // b2 bought 2023-03-15: 12 months passed; b3 bought 2023-06-01: not yet
    expect(r.openLots.map((l) => [l.buyTradeId, l.heldDays, l.heldOverYear])).toEqual([
      ["b2", 371, true],
      ["b3", 293, false],
    ]);
  });
});

describe("matchLots: multiple sells and years", () => {
  it("chains sells across lots and groups realised gain by the sell's calendar year", () => {
    const trades = [
      ...textbook(),
      sell("2024-05-01", 12, 170, { id: "s2" }), // FIFO: 5 @ 150 + 7 @ 120
      buy("2024-06-01", 4, 90, { id: "b4" }),
      sell("2025-01-15", 5, 100, { id: "s3" }), // FIFO: 3 @ 120 + 2 @ 90
    ];
    const r = matchLots(trades, "fifo", opts);
    expect(r.matches.map((m) => [m.sellTradeId, m.buyTradeId, m.quantity])).toEqual([
      ["s1", "b1", 10],
      ["s1", "b2", 5],
      ["s2", "b2", 5],
      ["s2", "b3", 7],
      ["s3", "b3", 3],
      ["s3", "b4", 2],
    ]);
    expect(r.realisedByYear.map((y) => y.year)).toEqual([2024, 2025]);
    // 2024: 650 (s1) + (2040 - 750 - 840 = 450) (s2)
    expect(r.realisedByYear[0].gain).toBeCloseTo(1100, 8);
    expect(r.realisedByYear[0].proceeds).toBeCloseTo(2400 + 2040, 8);
    // 2025: 500 - 360 - 180
    expect(r.realisedByYear[1].gain).toBeCloseTo(-40, 8);
    expect(r.totalRealised).toBeCloseTo(1060, 8);
    expect(r.openLots.map((l) => [l.buyTradeId, l.quantity])).toEqual([["b4", 2]]);
    expect(r.remainingCost).toBeCloseTo(180, 8);
  });
});

describe("matchLots: ordering", () => {
  it("processes by date regardless of input order, buys before sells on the same date", () => {
    const s = sell("2024-02-01", 5, 60, { id: "s" });
    const sameDayBuy = buy("2024-02-01", 5, 40, { id: "bSame" });
    const early = buy("2024-01-01", 10, 50, { id: "bEarly" });
    const trades = [s, sameDayBuy, early];

    const lifo = matchLots(trades, "lifo", opts);
    expect(lifo.matches).toHaveLength(1);
    expect(lifo.matches[0]).toMatchObject({ buyTradeId: "bSame", quantity: 5, holdingDays: 0, heldOverYear: false });
    expect(lifo.matches[0].gain).toBeCloseTo(100, 8);

    const fifo = matchLots(trades, "fifo", opts);
    expect(fifo.matches[0]).toMatchObject({ buyTradeId: "bEarly", holdingDays: 31 });
    expect(fifo.matches[0].gain).toBeCloseTo(50, 8);
    // input array untouched
    expect(trades.map((t) => t.id)).toEqual(["s", "bSame", "bEarly"]);
  });

  it("a same-day sell listed before its buy is matched, not oversold", () => {
    const r = matchLots(
      [sell("2024-01-01", 5, 10, { id: "s" }), buy("2024-01-01", 5, 8, { id: "b" })],
      "fifo",
      opts,
    );
    expect(r.warnings).toEqual([]);
    expect(r.totalRealised).toBeCloseTo(10, 8);
    expect(r.openLots).toEqual([]);
  });

  it("same-date buys keep input order (FIFO takes the first listed; HIFO ties go to the oldest)", () => {
    const a = buy("2024-01-01", 5, 10, { id: "a" });
    const b = buy("2024-01-01", 5, 10, { id: "b" });
    const s = sell("2024-03-01", 5, 12, { id: "s" });
    expect(matchLots([a, b, s], "fifo", opts).matches[0].buyTradeId).toBe("a");
    expect(matchLots([a, b, s], "lifo", opts).matches[0].buyTradeId).toBe("b");
    expect(matchLots([a, b, s], "hifo", opts).matches[0].buyTradeId).toBe("a");
  });
});

describe("matchLots: oversell", () => {
  it("matches what exists and warns with the unmatched quantity (never a negative lot)", () => {
    const r = matchLots([buy("2024-01-01", 10, 10, { id: "b" }), sell("2024-02-01", 15, 12, { id: "s" })], "fifo", opts);
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].quantity).toBe(10);
    expect(r.matches[0].proceeds).toBeCloseTo(120, 8);
    expect(r.totalRealised).toBeCloseTo(20, 8);
    expect(r.openLots).toEqual([]);
    expect(r.openQuantity).toBe(0);
    expect(r.remainingCost).toBe(0);
    expect(r.warnings).toEqual([{ kind: "oversold", tradeId: "s", date: "2024-02-01", quantity: 5 }]);
  });

  it("a sell with nothing held is fully oversold, for every method", () => {
    for (const method of LOT_METHODS) {
      const r = matchLots([sell("2024-02-01", 3, 12, { id: "s" })], method, opts);
      expect(r.matches).toEqual([]);
      expect(r.totalRealised).toBe(0);
      expect(r.warnings).toEqual([{ kind: "oversold", tradeId: "s", date: "2024-02-01", quantity: 3 }]);
    }
  });

  it("average method: an oversell empties the pool exactly and later buys start fresh", () => {
    const r = matchLots(
      [
        buy("2024-01-01", 10, 10),
        sell("2024-02-01", 12, 15, { id: "s" }),
        buy("2024-03-01", 4, 20),
      ],
      "average",
      opts,
    );
    expect(r.totalRealised).toBeCloseTo(150 - 100, 8);
    expect(r.remainingCost).toBeCloseTo(80, 8);
    expect(r.openQuantity).toBeCloseTo(4, 10);
    expect(r.openLots[0].unitCost).toBeCloseTo(20, 10);
    expect(r.warnings).toEqual([{ kind: "oversold", tradeId: "s", date: "2024-02-01", quantity: 2 }]);
  });
});

describe("matchLots: fees", () => {
  it("adds brokerage to a buy's cost and takes it off a sell's proceeds (quantity x price trades)", () => {
    const r = matchLots(
      [buy("2024-01-01", 10, 100, { brokerage: 10 }), sell("2024-06-01", 10, 120, { brokerage: 10 })],
      "fifo",
      opts,
    );
    expect(r.matches[0].cost).toBeCloseTo(1010, 8);
    expect(r.matches[0].proceeds).toBeCloseTo(1190, 8);
    expect(r.totalRealised).toBeCloseTo(180, 8);
  });

  it("partial sale of a lot with a fee carries the fee pro rata", () => {
    const r = matchLots([buy("2024-01-01", 10, 100, { brokerage: 10 }), sell("2024-06-01", 4, 120)], "fifo", opts);
    expect(r.openLots[0].unitCost).toBeCloseTo(101, 10);
    expect(r.matches[0].cost).toBeCloseTo(404, 8);
    expect(r.remainingCost).toBeCloseTo(606, 8);
  });

  it("does not add brokerage again when the broker's booked amount (which includes it) is used", () => {
    // 14 @ 37.86 = 530.04; the booked amount 530.99 already includes the commission
    const r = matchLots(
      [
        buy("2024-01-01", 14, 37.86, { bookedAmount: 530.99, brokerage: 0.95 }),
        sell("2024-06-01", 14, 40, { bookedAmount: 559.05, brokerage: 0.95 }),
      ],
      "fifo",
      opts,
    );
    expect(r.matches[0].cost).toBeCloseTo(530.99, 8);
    expect(r.matches[0].proceeds).toBeCloseTo(559.05, 8);
    expect(r.totalRealised).toBeCloseTo(28.06, 8);
  });

  it("ignores an implausible booked amount (different unit) and falls back to quantity x price + fee", () => {
    const r = matchLots([buy("2024-01-01", 10, 100, { bookedAmount: 5, brokerage: 2 })], "fifo", opts);
    expect(r.remainingCost).toBeCloseTo(1002, 8);
  });
});

describe("matchLots: excluded trades", () => {
  it("leaves out trades in another currency with a warning (currencies never mixed)", () => {
    const r = matchLots(
      [
        buy("2024-01-01", 10, 10, { id: "usd" }),
        buy("2024-01-02", 10, 10, { id: "eur", currency: "EUR" }),
        buy("2024-01-03", 1, 10, { id: "lower", currency: " usd " }),
        buy("2024-01-04", 1, 10, { id: "blank", currency: "" }),
      ],
      "fifo",
      opts,
    );
    expect(r.openLots.map((l) => l.buyTradeId)).toEqual(["usd", "lower", "blank"]);
    expect(r.openQuantity).toBe(12);
    expect(r.tradesUsed).toBe(3);
    expect(r.warnings).toEqual([{ kind: "currency_mismatch", tradeId: "eur", date: "2024-01-02", currency: "EUR" }]);
  });

  it("leaves out zero/negative/non-finite quantities or prices, unknown sides and bad dates", () => {
    const bad = [
      buy("2024-01-01", 0, 10, { id: "q0" }),
      buy("2024-01-01", -5, 10, { id: "qneg" }),
      buy("2024-01-01", 5, 0, { id: "p0" }),
      sell("2024-01-01", 5, -1, { id: "pneg" }),
      buy("2024-01-01", Number.NaN, 10, { id: "qnan" }),
      { ...buy("2024-01-01", 5, 10, { id: "side" }), side: "split" as unknown as "buy" },
      buy("not a date", 5, 10, { id: "date" }),
    ];
    const r = matchLots([...bad, buy("2024-01-02", 2, 10, { id: "ok" })], "fifo", opts);
    expect(r.openLots.map((l) => l.buyTradeId)).toEqual(["ok"]);
    expect(r.warnings.map((w) => [w.kind, "tradeId" in w ? w.tradeId : ""])).toEqual([
      ["invalid_trade", "q0"],
      ["invalid_trade", "qneg"],
      ["invalid_trade", "p0"],
      ["invalid_trade", "pneg"],
      ["invalid_trade", "qnan"],
      ["invalid_trade", "side"],
      ["invalid_trade", "date"],
    ]);
  });

  it("flags open lots that do not add up to the holding's recorded quantity", () => {
    const r = matchLots(textbook(), "fifo", { ...opts, heldQuantity: 20 });
    expect(r.warnings).toEqual([{ kind: "quantity_mismatch", lotQuantity: 15, heldQuantity: 20 }]);
    expect(matchLots(textbook(), "fifo", { ...opts, heldQuantity: 15 }).warnings).toEqual([]);
  });

  it("falls back to a positional id when a stored trade has none", () => {
    const t = { ...buy("2024-01-01", 1, 1), id: "" };
    expect(matchLots([t], "fifo", opts).openLots[0].buyTradeId).toBe("#1");
  });
});

describe("matchLots: average cost agrees with buildInvestedCapitalSeries", () => {
  const ledger = () => [
    buy("2022-01-05", 10, 100),
    buy("2022-02-10", 5, 130, { bookedAmount: 655, brokerage: 5 }),
    sell("2022-03-01", 6, 140),
    buy("2022-03-01", 2, 120),
    sell("2022-07-20", 4, 90, { bookedAmount: 355 }),
    buy("2023-01-11", 7.5, 88.4),
    sell("2023-05-02", 14.5, 110),
    buy("2023-08-08", 3.25, 101.7),
    sell("2024-01-15", 1.75, 125),
  ];

  it("the remaining cost basis equals the series' value after every trade date", () => {
    const trades = ledger();
    const series = buildInvestedCapitalSeries(trades);
    expect(series.length).toBeGreaterThan(3);
    for (const point of series) {
      const upTo = trades.filter((t) => t.tradeDate <= point.date);
      const r = matchLots(upTo, "average", opts);
      expect(r.remainingCost).toBeCloseTo(point.value, 8);
    }
    expect(matchLots(trades, "average", opts).remainingCost).toBeCloseTo(series.at(-1)!.value, 8);
  });

  it("also agrees after the position is fully closed and re-opened", () => {
    const trades = [
      buy("2024-01-01", 3, 10),
      buy("2024-01-02", 0.1, 10),
      buy("2024-01-02", 0.2, 10),
      sell("2024-02-01", 3.3, 12),
      buy("2024-03-01", 2, 15),
    ];
    const r = matchLots(trades, "average", opts);
    expect(r.remainingCost).toBeCloseTo(buildInvestedCapitalSeries(trades).at(-1)!.value, 8);
    expect(r.remainingCost).toBeCloseTo(30, 8);
    expect(r.warnings).toEqual([]);
  });
});

describe("matchLots: closed position and empty ledger", () => {
  it("a fully closed position has no open lots and the same total realised under every method", () => {
    const trades = [buy("2024-01-01", 10, 10), buy("2024-02-01", 5, 12), sell("2024-06-01", 8, 15), sell("2024-09-01", 7, 9)];
    const { realized } = summarizeClosedPosition(trades, 0);
    for (const method of LOT_METHODS) {
      const r = matchLots(trades, method, { ...opts, currentUnitPrice: 20 });
      expect(r.openLots).toEqual([]);
      expect(r.openQuantity).toBe(0);
      expect(r.remainingCost).toBe(0);
      expect(r.totalRealised).toBeCloseTo(realized, 8);
      expect(r.marketValue).toBe(0);
      expect(r.unrealisedGain).toBe(0);
      expect(r.warnings).toEqual([]);
    }
  });

  it("fractional quantities that add up exactly leave no residue and no oversell", () => {
    const r = matchLots([buy("2024-01-01", 0.1, 10), buy("2024-01-02", 0.2, 10), sell("2024-02-01", 0.3, 11)], "fifo", opts);
    expect(r.openLots).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.totalRealised).toBeCloseTo(0.3, 10);
  });

  it("an empty ledger gives empty results", () => {
    for (const method of LOT_METHODS) {
      const r = matchLots([], method, opts);
      expect(r).toMatchObject({
        openLots: [],
        matches: [],
        realisedByYear: [],
        totalProceeds: 0,
        totalRealised: 0,
        remainingCost: 0,
        openQuantity: 0,
        marketValue: null,
        unrealisedGain: null,
        warnings: [],
        tradesUsed: 0,
      });
    }
  });
});
