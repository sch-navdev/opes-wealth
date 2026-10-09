import { describe, expect, it } from "vitest";
import { EMPTY_EQUITY_METADATA, type EquityMetadata, type EquityTrade } from "@/lib/equities";
import { equityIncome, equityPerformance, equityXirr, gainSeries } from "./equity";

// Invented fixtures.
const trade = (id: string, side: "buy" | "sell", tradeDate: string, quantity: number, price: number): EquityTrade => ({
  id,
  side,
  tradeDate,
  quantity,
  price,
  currency: "USD",
  source: "manual",
});
const md = (trades: EquityTrade[], income: EquityMetadata["income"] = []): EquityMetadata => ({ ...EMPTY_EQUITY_METADATA, trades, income });

describe("equityPerformance", () => {
  it("compares value with the average cost of the open shares and adds income", () => {
    // 10 @ 100, 10 @ 140 -> average 120; 20 shares held -> cost 2400; value 3000
    const p = equityPerformance({
      quantity: 20,
      currentValue: 3000,
      metadata: md([trade("a", "buy", "2024-01-01", 10, 100), trade("b", "buy", "2024-06-01", 10, 140)], [{ date: "2025-01-01", amount: 60 }]),
    });
    expect(p.cost).toBe(2400);
    expect(p.gain).toBe(600);
    expect(p.gainPct).toBeCloseTo(0.25, 10);
    expect(p.income).toBe(60);
    expect(p.totalReturnPct).toBeCloseTo(0.275, 10); // (600 + 60) / 2400
  });

  it("returns nulls without trades, never NaN", () => {
    const p = equityPerformance({ quantity: 5, currentValue: 500, metadata: md([]) });
    expect(p.cost).toBeNull();
    expect(p.gainPct).toBeNull();
    expect(p.totalReturnPct).toBeNull();
  });
});

describe("equityXirr", () => {
  it("matches the closed-form rate for one buy and the current value one year later", () => {
    const r = equityXirr({
      metadata: md([trade("a", "buy", "2024-01-01", 10, 100)]),
      currency: "USD",
      quantity: 10,
      currentValue: 1100,
      today: "2024-12-31", // 365 days
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rate).toBeCloseTo(0.1, 4);
  });

  it("counts dividends as inflows", () => {
    const base = { currency: "USD", quantity: 10, currentValue: 1100, today: "2024-12-31" };
    const without = equityXirr({ ...base, metadata: md([trade("a", "buy", "2024-01-01", 10, 100)]) });
    const withIncome = equityXirr({ ...base, metadata: md([trade("a", "buy", "2024-01-01", 10, 100)], [{ date: "2024-07-01", amount: 50 }]) });
    expect(withIncome.ok && without.ok && withIncome.rate > without.rate).toBe(true);
  });

  it("explains why it cannot be computed", () => {
    const base = { currency: "USD", quantity: 10, currentValue: 1100, today: "2024-12-31" };
    expect(equityXirr({ ...base, metadata: md([]) })).toEqual({ ok: false, reason: "no_trades" });
    expect(equityXirr({ ...base, metadata: md([{ ...trade("a", "buy", "2024-01-01", 10, 100), currency: "EUR" }]) })).toEqual({ ok: false, reason: "mixed_currency" });
    expect(equityXirr({ ...base, today: "2024-01-10", metadata: md([trade("a", "buy", "2024-01-01", 10, 100)]) })).toEqual({ ok: false, reason: "too_short" });
  });
});

describe("equityIncome", () => {
  it("separates the trailing 12 months and yields on value and cost", () => {
    const s = equityIncome(md([], [{ date: "2023-01-01", amount: 40 }, { date: "2024-09-01", amount: 30 }, { date: "2025-03-01", amount: 30 }]), 3000, 2400, "2025-06-30");
    expect(s?.total).toBe(100);
    expect(s?.trailing12m).toBe(60);
    expect(s?.yieldOnValue).toBeCloseTo(0.02, 10);
    expect(s?.yieldOnCost).toBeCloseTo(0.025, 10);
    expect(equityIncome(md([]), 1, 1, "2025-06-30")).toBeNull();
  });
});

describe("gainSeries", () => {
  it("subtracts the cost basis in force on each date and skips dates before the first trade", () => {
    const g = gainSeries(md([trade("a", "buy", "2024-02-01", 10, 100), trade("b", "buy", "2024-04-01", 10, 100)]), [
      { date: "2024-01-01", value: 0 },
      { date: "2024-03-01", value: 1100 },
      { date: "2024-05-01", value: 2300 },
    ]);
    expect(g).toEqual([
      { date: "2024-03-01", value: 100 },
      { date: "2024-05-01", value: 300 },
    ]);
  });
});

describe("costValueRows", () => {
  it("pairs each history value with the cost basis in force", async () => {
    const { costValueRows } = await import("./equity");
    expect(costValueRows(md([trade("a", "buy", "2024-02-01", 10, 100)]), [{ date: "2024-01-01", value: 5 }, { date: "2024-03-01", value: 1100 }])).toEqual([
      { date: "2024-03-01", value: 1100, cost: 1000 },
    ]);
  });
});
