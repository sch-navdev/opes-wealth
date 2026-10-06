import { describe, expect, it } from "vitest";
import { buildIncomeCalendar } from "@/lib/income-calendar";
import type { PassiveIncomeAsset } from "@/lib/passive-income";

// Calendar window for this start date: 2025-11 .. 2026-10 (index 0..11).
const START = "2025-11-15";

const asset = (over: Partial<PassiveIncomeAsset> & { category: string }): PassiveIncomeAsset => {
  const { category, ...rest } = over;
  return {
    id: "a1",
    name: "Asset",
    quantity: 1,
    current_value: 1000,
    currency: "USD",
    is_liability: false,
    metadata: null,
    asset_categories: { name: category },
    ...rest,
  };
};

const build = (assets: PassiveIncomeAsset[], rates: Record<string, number> = { USD: 1 }, baseCurrency = "USD") =>
  buildIncomeCalendar({ assets, rates, baseCurrency, startDate: START });

// 36,500/yr = exactly 100 per day.
const rental = (over: Partial<PassiveIncomeAsset> = {}) =>
  asset({
    category: "Real Estate",
    id: "re",
    name: "Flat",
    current_value: 500_000,
    metadata: {
      contract_price: 365_000,
      tenancy_contracts: [{ id: "t1", tenant_name: "T", start_date: "2025-01-01", end_date: "2026-12-31", annual_rent: 36_500 }],
    },
    ...over,
  });

describe("buildIncomeCalendar", () => {
  it("returns 12 empty months, null yields and no peak for empty input", () => {
    const cal = build([]);
    expect(cal.months).toHaveLength(12);
    expect(cal.months.every((m) => m.total === 0 && m.items.length === 0)).toBe(true);
    expect(cal.annualTotal).toBe(0);
    expect(cal.monthlyAverage).toBe(0);
    expect(cal.peakMonth).toBeNull();
    expect(cal.yieldOnCostPct).toBeNull();
    expect(cal.currentYieldPct).toBeNull();
  });

  it("rolls the months over the year end", () => {
    const cal = build([]);
    expect(cal.months.map((m) => m.month)).toEqual([
      "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
      "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("spreads rent by the days of each calendar month (contract basis) and computes yields", () => {
    const cal = build([rental()]);
    expect(cal.months[0].total).toBeCloseTo(3000, 8); // Nov, 30 days
    expect(cal.months[1].total).toBeCloseTo(3100, 8); // Dec, 31 days
    expect(cal.months[3].total).toBeCloseTo(2800, 8); // Feb 2026, 28 days
    expect(cal.months[0].bySource.rental).toBeCloseTo(3000, 8);
    expect(cal.months[0].items[0]).toMatchObject({ assetId: "re", source: "rental", basis: "contract" });
    expect(cal.annualTotal).toBeCloseTo(36_500, 8); // 365 days
    expect(cal.monthlyAverage).toBeCloseTo(36_500 / 12, 8);
    expect(cal.peakMonth).toBe("2025-12");
    expect(cal.yieldOnCostPct).toBeCloseTo(10, 8); // 36,500 / 365,000
    expect(cal.currentYieldPct).toBeCloseTo(7.3, 8); // 36,500 / 500,000
  });

  it("stops rent when the contract ends (no renewal assumed)", () => {
    const cal = build([
      rental({
        metadata: {
          tenancy_contracts: [{ id: "t1", tenant_name: "T", start_date: "2025-01-01", end_date: "2025-12-31", annual_rent: 36_500 }],
        },
      }),
    ]);
    expect(cal.months[0].total).toBeCloseTo(3000, 8);
    expect(cal.months[1].total).toBeCloseTo(3100, 8);
    expect(cal.months[2].total).toBe(0);
    expect(cal.annualTotal).toBeCloseTo(6100, 8);
  });

  it("places dividends in the months they were paid a year earlier, converted to the base currency", () => {
    // EUR holding, USD base, 1 USD = 0.5 EUR => 1 EUR = 2 USD.
    const stock = asset({
      category: "Equities",
      id: "st",
      name: "ACME",
      currency: "EUR",
      quantity: 10,
      current_value: 1500,
      metadata: {
        trades: [{ id: "x", tradeDate: "2024-01-01", side: "buy", quantity: 10, price: 100, currency: "EUR", source: "manual" }],
        income: [
          { date: "2025-03-10", amount: 40 },
          { date: "2025-09-10", amount: 60 },
        ],
      },
    });
    const cal = build([stock], { USD: 1, EUR: 0.5 });
    expect(cal.months[4].total).toBeCloseTo(80, 8); // Mar 2026
    expect(cal.months[4].items[0]).toMatchObject({ basis: "history", date: "2026-03-10", amount: 80 });
    expect(cal.months[10].total).toBeCloseTo(120, 8); // Sep 2026
    expect(cal.annualTotal).toBeCloseTo(200, 8);
    expect(cal.yieldOnCostPct).toBeCloseTo(10, 8); // 200 / (10 x 100 EUR = 2,000 USD)
    expect(cal.currentYieldPct).toBeCloseTo((200 / 3000) * 100, 8);
  });

  it("projects a position with no income history as nothing, and a closed one as nothing", () => {
    const closed = asset({
      category: "Equities",
      quantity: 0,
      metadata: { trades: [], income: [{ date: "2025-03-10", amount: 40 }] },
    });
    expect(build([closed]).annualTotal).toBe(0);
  });

  it("splits a REIT's target-yield projection into 4 quarterly estimates", () => {
    const reit = asset({
      category: "SCPI",
      id: "sc",
      name: "SCPI X",
      quantity: 50,
      current_value: 9000,
      metadata: { subscription_price: 200, target_yield_pct: 4 }, // invested 10,000 -> 400/yr
    });
    const cal = build([reit]);
    [2, 5, 8, 11].forEach((i) => {
      expect(cal.months[i].total).toBeCloseTo(100, 8);
      expect(cal.months[i].items[0].basis).toBe("estimate");
    });
    expect(cal.months[0].total).toBe(0);
    expect(cal.annualTotal).toBeCloseTo(400, 8);
    expect(cal.yieldOnCostPct).toBeCloseTo(4, 8);
    expect(cal.currentYieldPct).toBeCloseTo((400 / 9000) * 100, 8);
  });

  it("uses a REIT's dated expected ledger entries when no yield is recorded", () => {
    const reit = asset({
      category: "SCPI",
      id: "sc",
      metadata: {
        dividends: [
          { id: "d1", date: "2026-01-15", amount: 50, status: "expected", quarter: "T4 2025" },
          { id: "d2", date: "2026-04-15", amount: 70, status: "expected", quarter: "T1 2026" },
        ],
      },
    });
    const cal = build([reit]);
    expect(cal.months[2]).toMatchObject({ month: "2026-01", total: 50 });
    expect(cal.months[5]).toMatchObject({ month: "2026-04", total: 70 });
    expect(cal.months[2].items[0]).toMatchObject({ basis: "contract", date: "2026-01-15" });
    expect(cal.yieldOnCostPct).toBeNull(); // no subscription price => no cost basis
  });

  it("places private-equity distributions at their due date, ignoring those beyond the window", () => {
    const pe = asset({
      category: "Private Equity",
      id: "pe",
      metadata: {
        called_capital_manual: 5000,
        projected_distributions: [
          { id: "p1", due_date: "2026-02-20", amount: 500 },
          { id: "p2", due_date: "2027-03-01", amount: 900 },
        ],
      },
    });
    const cal = build([pe]);
    expect(cal.months[3]).toMatchObject({ month: "2026-02", total: 500 });
    expect(cal.months[3].bySource.private_equity).toBe(500);
    expect(cal.annualTotal).toBe(500);
    expect(cal.yieldOnCostPct).toBeCloseTo(10, 8);
  });

  it("combines sources: totals, average and peak month", () => {
    const pe = asset({
      category: "Private Equity",
      id: "pe",
      metadata: { projected_distributions: [{ id: "p1", due_date: "2026-02-20", amount: 500 }] },
    });
    const cal = build([rental(), pe]);
    expect(cal.months[3].total).toBeCloseTo(3300, 8); // 2,800 rent + 500 distribution
    expect(cal.peakMonth).toBe("2026-02");
    expect(cal.annualTotal).toBeCloseTo(37_000, 8);
    expect(cal.monthlyAverage).toBeCloseTo(37_000 / 12, 8);
    // PE has no cost basis -> excluded from yield: still rent / rent cost.
    expect(cal.yieldOnCostPct).toBeCloseTo(10, 8);
  });

  it("ignores liabilities and non-income categories", () => {
    const cal = build([
      asset({ category: "Cash", current_value: 99_999 }),
      rental({ is_liability: true }),
    ]);
    expect(cal.annualTotal).toBe(0);
  });
});
