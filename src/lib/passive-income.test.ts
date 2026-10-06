import { describe, expect, it } from "vitest";
import {
  PASSIVE_INCOME_SOURCES,
  buildPassiveIncome,
  rentInWindow,
  type PassiveIncomeAsset,
} from "@/lib/passive-income";

const TODAY = "2025-06-30";
// Windows implied by TODAY: last 12 months = 2024-07-01..2025-06-30 (365 days),
// next 12 months = 2025-07-01..2026-06-30 (365 days).

const asset = (over: Partial<PassiveIncomeAsset> & { category?: string | null }): PassiveIncomeAsset => {
  const { category = "Cash", ...rest } = over;
  return {
    id: "a1",
    name: "Asset",
    quantity: 1,
    current_value: 1000,
    currency: "USD",
    is_liability: false,
    metadata: null,
    asset_categories: category === null ? null : { name: category },
    ...rest,
  };
};

const identity = (amount: number) => amount;
const byValue = (a: PassiveIncomeAsset) => a.current_value;

const build = (
  assets: PassiveIncomeAsset[],
  toBase: (amount: number, currency: string) => number = identity,
  valueBase: (a: PassiveIncomeAsset) => number = byValue,
) =>
  buildPassiveIncome(assets, TODAY, toBase, valueBase);

describe("rentInWindow", () => {
  const W_FROM = "2024-07-01";
  const W_TO = "2025-06-30";

  it("a contract covering the whole window pays one full year", () => {
    expect(rentInWindow([{ start_date: "2024-01-01", end_date: "2026-12-31", annual_rent: 36500 }], W_FROM, W_TO)).toBeCloseTo(36500, 8);
  });

  it("pro-rates by days when the contract only covers part of the window", () => {
    // 2024-07-01..2024-12-31 = 184 days
    expect(rentInWindow([{ start_date: "2024-01-01", end_date: "2024-12-31", annual_rent: 36500 }], W_FROM, W_TO)).toBeCloseTo(18400, 8);
    // starts mid-window: 2025-01-01..2025-06-30 = 181 days
    expect(rentInWindow([{ start_date: "2025-01-01", end_date: "2027-01-01", annual_rent: 36500 }], W_FROM, W_TO)).toBeCloseTo(18100, 8);
  });

  it("counts both endpoints (a one-day overlap is one day of rent)", () => {
    expect(rentInWindow([{ start_date: "2025-06-30", end_date: "2025-06-30", annual_rent: 36500 }], W_FROM, W_TO)).toBeCloseTo(100, 8);
    expect(rentInWindow([{ start_date: "2020-01-01", end_date: "2024-07-01", annual_rent: 36500 }], W_FROM, W_TO)).toBeCloseTo(100, 8);
  });

  it("an open-ended contract runs through the end of the window", () => {
    expect(rentInWindow([{ start_date: "2024-01-01", end_date: "", annual_rent: 36500 }], W_FROM, W_TO)).toBeCloseTo(36500, 8);
  });

  it("contracts entirely outside the window contribute nothing", () => {
    expect(rentInWindow([{ start_date: "2020-01-01", end_date: "2024-06-30", annual_rent: 36500 }], W_FROM, W_TO)).toBe(0);
    expect(rentInWindow([{ start_date: "2025-07-01", end_date: "2026-06-30", annual_rent: 36500 }], W_FROM, W_TO)).toBe(0);
  });

  it("skips contracts with no start date or no positive rent", () => {
    expect(
      rentInWindow(
        [
          { start_date: "", end_date: "2025-01-01", annual_rent: 36500 },
          { start_date: "2024-01-01", end_date: "2025-01-01", annual_rent: null },
          { start_date: "2024-01-01", end_date: "2025-01-01", annual_rent: 0 },
          { start_date: "2024-01-01", end_date: "2025-01-01", annual_rent: -100 },
        ],
        W_FROM,
        W_TO,
      ),
    ).toBe(0);
  });

  it("sums sequential contracts (a re-let) without double counting the gap", () => {
    const total = rentInWindow(
      [
        { start_date: "2024-01-01", end_date: "2024-12-31", annual_rent: 36500 }, // 184 days in window
        { start_date: "2025-01-01", end_date: "2025-12-31", annual_rent: 73000 }, // 181 days in window
      ],
      W_FROM,
      W_TO,
    );
    expect(total).toBeCloseTo(18400 + 36200, 8);
  });

  it("an empty list or an empty window is 0", () => {
    expect(rentInWindow([], W_FROM, W_TO)).toBe(0);
    expect(rentInWindow([{ start_date: "2024-01-01", end_date: "", annual_rent: 36500 }], "2025-07-01", "2025-06-30")).toBe(0);
  });
});

describe("buildPassiveIncome: empty and filtered inputs", () => {
  it("no assets: zero totals, four zeroed source buckets in a fixed order, null yield", () => {
    const s = build([]);
    expect(s.lastYear).toBe(0);
    expect(s.projected).toBe(0);
    expect(s.yieldPct).toBeNull();
    expect(s.rows).toEqual([]);
    expect(s.bySource.map((b) => b.source)).toEqual(PASSIVE_INCOME_SOURCES);
    expect(s.bySource.every((b) => b.lastYear === 0 && b.projected === 0 && b.count === 0)).toBe(true);
  });

  it("ignores liabilities, other categories, uncategorised assets, and holdings with no income", () => {
    const s = build([
      asset({ id: "cash", category: "Cash" }),
      asset({ id: "none", category: null }),
      asset({
        id: "liab",
        category: "Equities",
        is_liability: true,
        metadata: { income: [{ date: "2025-01-01", amount: 500 }] },
      }),
      asset({ id: "noincome", category: "Equities", metadata: { income: [] } }),
      asset({ id: "noscpi", category: "SCPI", metadata: {} }),
    ]);
    expect(s.rows).toEqual([]);
    expect(s.lastYear).toBe(0);
  });
});

describe("buildPassiveIncome: SCPI / REIT", () => {
  const dividends = [
    { id: "1", date: "2024-04-15", amount: 100, status: "received", quarter: "" }, // before window
    { id: "2", date: "2024-07-15", amount: 100, status: "received", quarter: "" },
    { id: "3", date: "2025-04-15", amount: 150, status: "received", quarter: "" },
    { id: "4", date: "2025-09-15", amount: 120, status: "expected", quarter: "" },
    { id: "5", date: "2027-01-15", amount: 999, status: "expected", quarter: "" }, // beyond next 12 months
    { id: "6", date: "2025-05-01", amount: 999, status: "expected", quarter: "" }, // overdue "expected", already past
  ];
  const scpi = (md: Record<string, unknown>, over: Partial<PassiveIncomeAsset> = {}) =>
    asset({ id: "s", category: "SCPI", quantity: 50, current_value: 9000, metadata: { subscription_price: 200, entry_fee_pct: 10, dividends, ...md }, ...over });

  it("last year = dividends received in the trailing 12 months", () => {
    const s = build([scpi({ target_yield_pct: 5 })]);
    expect(s.rows[0].lastYear).toBe(250);
  });

  it("projection from the targeted yield: invested x rate", () => {
    const [row] = build([scpi({ target_yield_pct: 5 })]).rows;
    expect(row.source).toBe("reit");
    expect(row.method).toBe("target_yield");
    expect(row.projected).toBeCloseTo(500, 8); // 10000 x 5%
    expect(row.yieldPct).toBeCloseTo((500 / 9000) * 100, 8);
  });

  it("without a target, uses the average of the recorded annual rates", () => {
    const [row] = build([scpi({ yield_history: [{ id: "a", year: 2023, rate: 4 }, { id: "b", year: 2024, rate: 6 }] })]).rows;
    expect(row.method).toBe("yield_history");
    expect(row.projected).toBeCloseTo(500, 8);
  });

  it("a zero target is treated as no target", () => {
    const [row] = build([scpi({ target_yield_pct: 0, yield_history: [{ id: "a", year: 2024, rate: 4 }] })]).rows;
    expect(row.method).toBe("yield_history");
    expect(row.projected).toBeCloseTo(400, 8);
  });

  it("with neither, falls back to the realised trailing yield", () => {
    const [row] = build([scpi({})]).rows;
    expect(row.method).toBe("trailing_yield");
    expect(row.projected).toBeCloseTo(250, 8); // 250 received on 10000 invested = 2.5% -> 250
  });

  it("with no yield at all and no invested capital, projects the scheduled dividends of the next 12 months", () => {
    const [row] = build([scpi({ subscription_price: null }, { quantity: 0 })]).rows;
    expect(row.method).toBe("scheduled");
    expect(row.projected).toBe(120);
  });

  it("with invested capital but no yield or received income, also falls back to the schedule", () => {
    const [row] = build([scpi({ dividends: [{ id: "x", date: "2025-12-15", amount: 80, status: "expected", quarter: "" }] })]).rows;
    expect(row.method).toBe("scheduled");
    expect(row.projected).toBe(80);
  });

  it("an SCPI with nothing to project is dropped when it also received nothing", () => {
    expect(build([scpi({ dividends: [] })]).rows).toEqual([]);
  });
});

describe("buildPassiveIncome: stocks", () => {
  const equity = (income: unknown[], quantity: number) =>
    asset({ id: "e", category: "Equities", quantity, current_value: 5000, metadata: { income } });
  const income = [
    { date: "2024-06-30", amount: 99 }, // one day before the window
    { date: "2024-07-01", amount: 10 }, // first day of the window
    { date: "2025-06-30", amount: 5 }, // today
    { date: "2025-07-01", amount: 100 }, // future
  ];

  it("last 12 months of income; the projection is the same run-rate", () => {
    const [row] = build([equity(income, 10)]).rows;
    expect(row.source).toBe("stocks");
    expect(row.lastYear).toBe(15);
    expect(row.projected).toBe(15);
    expect(row.method).toBe("run_rate");
    expect(row.yieldPct).toBeCloseTo((15 / 5000) * 100, 8);
  });

  it("a closed position keeps its history but projects nothing", () => {
    const [row] = build([equity(income, 0)]).rows;
    expect(row.lastYear).toBe(15);
    expect(row.projected).toBe(0);
    expect(row.method).toBeNull();
  });

  it("ignores non-finite amounts", () => {
    const [row] = build([equity([{ date: "2025-01-01", amount: NaN }, { date: "2025-01-02", amount: 7 }], 1)]).rows;
    expect(row.lastYear).toBe(7);
  });
});

describe("buildPassiveIncome: rental", () => {
  const property = (contracts: unknown[]) =>
    asset({ id: "r", category: "Real Estate", current_value: 1_000_000, metadata: { tenancy_contracts: contracts } });

  it("a contract spanning both windows yields one full year back and one forward", () => {
    const [row] = build([property([{ id: "c", tenant_name: "T", start_date: "2024-01-01", end_date: "2026-12-31", annual_rent: 36500 }])]).rows;
    expect(row.source).toBe("rental");
    expect(row.lastYear).toBeCloseTo(36500, 8);
    expect(row.projected).toBeCloseTo(36500, 8);
    expect(row.method).toBe("contracts");
    expect(row.yieldPct).toBeCloseTo(3.65, 8);
  });

  it("an expired contract is not assumed to renew: history only", () => {
    const [row] = build([property([{ id: "c", tenant_name: "T", start_date: "2024-01-01", end_date: "2025-03-31", annual_rent: 36500 }])]).rows;
    expect(row.lastYear).toBeCloseTo(27400, 8); // 274 days
    expect(row.projected).toBe(0);
    expect(row.method).toBeNull();
  });

  it("a future-starting contract only projects, from its start date", () => {
    const [row] = build([property([{ id: "c", tenant_name: "T", start_date: "2025-10-01", end_date: "2026-09-30", annual_rent: 36500 }])]).rows;
    expect(row.lastYear).toBe(0);
    expect(row.projected).toBeCloseTo(36500 * (273 / 365), 6); // 2025-10-01..2026-06-30 = 273 days
    expect(row.method).toBe("contracts");
  });

  it("an open-ended contract continues into the projection", () => {
    const [row] = build([property([{ id: "c", tenant_name: "T", start_date: "2025-01-01", end_date: "", annual_rent: 36500 }])]).rows;
    expect(row.projected).toBeCloseTo(36500, 8);
  });

  it("a property with no contracts is dropped", () => {
    expect(build([property([])]).rows).toEqual([]);
  });

  it("legacy single-contract metadata (pre tenancy_contracts array) still counts", () => {
    const legacy = asset({
      id: "legacy",
      category: "Real Estate",
      current_value: 500000,
      metadata: { tenant_name: "Old Tenant", tenancy_start_date: "2024-01-01", tenancy_end_date: "2026-12-31", annual_rent: 36500 },
    });
    expect(build([legacy]).rows[0].lastYear).toBeCloseTo(36500, 8);
  });

  it("last-12-months rent is still one full year when today is 29 February", () => {
    const summary = buildPassiveIncome(
      [property([{ id: "c", tenant_name: "T", start_date: "2020-01-01", end_date: "2030-12-31", annual_rent: 36500 }])],
      "2028-02-29",
      identity,
      byValue,
    );
    expect(summary.rows[0].lastYear).toBeCloseTo(36500, 6);
  });
});

describe("buildPassiveIncome: private equity", () => {
  const fund = (projected_distributions: unknown[]) =>
    asset({ id: "p", category: "Private Equity", current_value: 50000, metadata: { projected_distributions } });

  it("sums projected distributions dated tomorrow through one year ahead; last year is 0", () => {
    const [row] = build([
      fund([
        { id: "1", due_date: "2025-06-30", amount: 9999 }, // today: excluded
        { id: "2", due_date: "2025-07-01", amount: 1000 }, // first day: included
        { id: "3", due_date: "2026-06-30", amount: 2000 }, // last day: included
        { id: "4", due_date: "2026-07-01", amount: 9999 }, // beyond
      ]),
    ]).rows;
    expect(row.source).toBe("private_equity");
    expect(row.projected).toBe(3000);
    expect(row.lastYear).toBe(0);
    expect(row.method).toBe("distributions");
    expect(row.yieldPct).toBeCloseTo(6, 8);
  });

  it("nothing in the next 12 months: dropped", () => {
    expect(build([fund([{ id: "1", due_date: "2030-01-01", amount: 5000 }])]).rows).toEqual([]);
  });
});

describe("buildPassiveIncome: aggregation", () => {
  const holdings = (): PassiveIncomeAsset[] => [
    asset({
      id: "stock",
      name: "Stock",
      category: "Equities",
      quantity: 10,
      current_value: 2000,
      metadata: { income: [{ date: "2025-01-01", amount: 100 }] },
    }),
    asset({
      id: "reit",
      name: "Reit",
      category: "SCPI",
      quantity: 50,
      current_value: 9000,
      metadata: { subscription_price: 200, target_yield_pct: 5, dividends: [] },
    }),
    asset({
      id: "flat",
      name: "Flat",
      category: "Real Estate",
      current_value: 300000,
      metadata: { tenancy_contracts: [{ id: "c", tenant_name: "T", start_date: "2024-01-01", end_date: "", annual_rent: 18250 }] },
    }),
    asset({ id: "cash", category: "Cash", current_value: 99999 }),
  ];

  it("totals are the sums of the rows, and the per-source buckets add up to the totals", () => {
    const s = build(holdings());
    expect(s.rows).toHaveLength(3);
    expect(s.lastYear).toBeCloseTo(100 + 0 + 18250, 8);
    expect(s.projected).toBeCloseTo(100 + 500 + 18250, 8);
    expect(s.bySource.reduce((t, b) => t + b.lastYear, 0)).toBeCloseTo(s.lastYear, 8);
    expect(s.bySource.reduce((t, b) => t + b.projected, 0)).toBeCloseTo(s.projected, 8);
    expect(s.bySource.reduce((t, b) => t + b.count, 0)).toBe(3);
    expect(s.bySource.find((b) => b.source === "private_equity")).toEqual({ source: "private_equity", lastYear: 0, projected: 0, count: 0 });
  });

  it("portfolio yield = projected over the value of the income-producing holdings only (cash excluded)", () => {
    const s = build(holdings());
    expect(s.yieldPct).toBeCloseTo((18850 / (2000 + 9000 + 300000)) * 100, 8);
  });

  it("rows are sorted by their larger of projected / last-year income, descending", () => {
    const s = build(holdings());
    expect(s.rows.map((r) => r.id)).toEqual(["flat", "reit", "stock"]);
  });

  it("converts amounts into the base currency per asset currency, while yield uses the supplied base value", () => {
    const eurStock = asset({
      id: "eur",
      category: "Equities",
      quantity: 10,
      currency: "EUR",
      current_value: 1000,
      metadata: { income: [{ date: "2025-01-01", amount: 50 }] },
    });
    // 1 EUR = 2 USD; the base value of the holding is 2000.
    const s = build([eurStock], (amount, cur) => (cur === "EUR" ? amount * 2 : amount), () => 2000);
    expect(s.rows[0].lastYear).toBe(100);
    expect(s.rows[0].projected).toBe(100);
    expect(s.rows[0].yieldPct).toBeCloseTo(5, 8);
    expect(s.yieldPct).toBeCloseTo(5, 8);
  });

  it("yield is null when the holding has no base value", () => {
    const s = build(holdings(), identity, () => 0);
    expect(s.yieldPct).toBeNull();
    expect(s.rows.every((r) => r.yieldPct === null)).toBe(true);
  });

  it("does not mutate the caller's assets array order", () => {
    const input = holdings();
    const order = input.map((a) => a.id);
    build(input);
    expect(input.map((a) => a.id)).toEqual(order);
  });
});
