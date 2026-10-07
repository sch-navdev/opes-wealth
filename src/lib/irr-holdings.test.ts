import { describe, expect, it } from "vitest";
import { buildComparableHoldings, collectHoldingFxRequests, type HoldingAssetInput } from "./irr-holdings";
import { summarizeFlows, xirr } from "./irr";

const TODAY = "2026-10-07";
const RATES = { USD: 1, EUR: 0.9, AED: 3.6725 };

function asset(over: Partial<HoldingAssetInput> & { category: string }): HoldingAssetInput {
  const { category, ...rest } = over;
  return {
    id: "a1",
    name: "Asset",
    quantity: 1,
    current_value: 100,
    currency: "USD",
    is_liability: false,
    metadata: {},
    purchase_date: "2020-01-01",
    asset_categories: { name: category },
    ...rest,
  };
}

function build(assets: HoldingAssetInput[], opts: { fxHistory?: Record<string, Record<string, number>>; base?: string } = {}) {
  return buildComparableHoldings({
    assets,
    baseCurrency: opts.base ?? "USD",
    rates: RATES,
    fxHistory: opts.fxHistory ?? {},
    today: TODAY,
  });
}

const one = (a: HoldingAssetInput, opts?: Parameters<typeof build>[1]) => build([a], opts)[0];

describe("Real Estate", () => {
  const base = asset({
    category: "Real Estate",
    name: "Flat",
    current_value: 300000, // equity
    metadata: {
      purchasePrice: 1000000,
      registration_fee_amount: 20000,
      market_valuation: 1300000,
      linked_loan: { amount: 700000 },
      tenancy_contracts: [
        { id: "c1", tenant_name: "T", start_date: "2023-01-01", end_date: "2024-01-01", annual_rent: 60000, contract_value: null },
      ],
      property_expenses: [
        { id: "e1", description: "AC", date: "2023-06-01", amount: 3000 },
        { id: "e2", description: "future", date: "2027-01-01", amount: 999 },
      ],
    },
  });

  it("all-in cost out, contracted rent in (past only), expenses out, GROSS market value as terminal", () => {
    const h = one(base);
    expect(h.unavailable).toBeUndefined();
    const flows = h.flows!;
    expect(flows[0]).toEqual({ date: "2020-01-01", amount: -1020000 });
    expect(flows.at(-1)).toEqual({ date: TODAY, amount: 1300000 });
    const rent = flows.filter((f) => f.amount === 5000);
    expect(rent).toHaveLength(12);
    expect(rent[0].date).toBe("2023-02-01");
    expect(rent.at(-1)!.date).toBe("2024-01-01");
    expect(flows.filter((f) => f.amount === -3000)).toHaveLength(1);
    expect(flows.some((f) => f.amount === -999)).toBe(false); // future expense
    // the loan is not modelled: financing is flagged as excluded
    expect(h.includes).toEqual({ purchase: true, income: true, currentValue: true, financing: false, costs: true });
    const s = summarizeFlows(flows);
    expect(s.moneyOut).toBe(1300000 + 60000);
    expect(xirr(flows).ok).toBe(true);
  });

  it("no loan means nothing to exclude (financing complete)", () => {
    const h = one({ ...base, metadata: { ...base.metadata, linked_loan: { amount: null } } });
    expect(h.includes?.financing).toBe(true);
  });

  it("a loan without a market valuation cannot give the gross value", () => {
    const h = one({ ...base, metadata: { ...base.metadata, market_valuation: null } });
    expect(h.unavailable).toBe("missing_value");
  });

  it("no loan and no valuation: current_value is the value", () => {
    const h = one({
      ...base,
      current_value: 1100000,
      metadata: { purchasePrice: 1000000, linked_loan: { amount: null } },
    });
    expect(h.flows).toEqual([
      { date: "2020-01-01", amount: -1000000 },
      { date: TODAY, amount: 1100000 },
    ]);
  });

  it("contract_price wins over purchasePrice; typed reasons for missing price / date", () => {
    const h = one({ ...base, metadata: { ...base.metadata, contract_price: 900000, registration_fee_amount: 0 } });
    expect(h.flows![0].amount).toBe(-900000);
    expect(one({ ...base, metadata: { market_valuation: 1 } }).unavailable).toBe("missing_purchase_price");
    expect(one({ ...base, purchase_date: null }).unavailable).toBe("missing_purchase_date");
    expect(one({ ...base, purchase_date: "garbage" }).unavailable).toBe("missing_purchase_date");
  });

  it("an open-ended lease runs to today, counting only complete months", () => {
    const h = one({
      ...base,
      metadata: {
        purchasePrice: 1000000,
        market_valuation: 1200000,
        tenancy_contracts: [{ id: "c", tenant_name: "T", start_date: "2026-01-15", end_date: "", annual_rent: 12000, contract_value: null }],
      },
    });
    const rent = h.flows!.filter((f) => f.amount === 1000);
    expect(rent).toHaveLength(8); // 15 Feb ... 15 Sep; 15 Oct is not due yet
    expect(rent.at(-1)!.date).toBe("2026-09-15");
  });

  it("rent dated before the purchase is ignored; contract_value derives the rent; future leases add nothing", () => {
    const h = one({
      ...base,
      purchase_date: "2023-07-01",
      metadata: {
        purchasePrice: 1000000,
        market_valuation: 1200000,
        tenancy_contracts: [
          { id: "c1", tenant_name: "T", start_date: "2023-01-01", end_date: "2023-12-31", annual_rent: null, contract_value: 36500 },
          { id: "c2", tenant_name: "F", start_date: "2027-01-01", end_date: "2027-12-31", annual_rent: 99999, contract_value: null },
        ],
      },
    });
    const rent = h.flows!.filter((f) => f.amount > 0 && !(f.date === TODAY));
    expect(rent.every((f) => f.date >= "2023-07-01")).toBe(true);
    expect(rent).toHaveLength(7); // 1 Jul..1 Dec 2023, plus the last month clamped to the lease end (31 Dec)
    expect(rent[0].amount).toBeCloseTo(36500 / 12, 6);
  });

  it("off-plan: paid milestones + fees out, equity (market value minus balance owed) in", () => {
    const h = one({
      ...base,
      purchase_date: "2024-01-01",
      current_value: 0,
      metadata: {
        is_offplan: true,
        contract_price: 1000000,
        registration_fee_amount: 40000,
        market_valuation: 1100000,
        outstanding_balance: 700000,
        payment_schedule: [
          { id: "m1", milestone: "Booking", due_date: "2024-01-01", amount: 100000, percentage: 10, status: "paid" },
          { id: "m2", milestone: "Next", due_date: "2025-01-01", amount: 200000, percentage: 20, status: "paid" },
          { id: "m3", milestone: "Later", due_date: "2027-01-01", amount: 700000, percentage: 70, status: "pending" },
        ],
      },
    });
    expect(h.flows).toEqual([
      { date: "2024-01-01", amount: -100000 },
      { date: "2024-01-01", amount: -40000 },
      { date: "2025-01-01", amount: -200000 },
      { date: TODAY, amount: 400000 },
    ]);
  });

  it("off-plan with nothing paid on record", () => {
    const h = one({ ...base, metadata: { is_offplan: true, contract_price: 1000000, market_valuation: 1100000 } });
    expect(h.unavailable).toBe("missing_purchase_price");
  });
});

describe("Vehicles", () => {
  const car = asset({
    category: "Vehicles",
    current_value: 70000,
    purchase_date: "2022-03-01",
    metadata: { purchase_price: 100000, expenses: [{ id: "x", date: "2023-01-01", category: "maintenance", description: "", amount: 800 }] },
  });

  it("purchase price out, dated expenses out, current value in; lump cost fields stay out", () => {
    const h = one({ ...car, metadata: { ...car.metadata, maintenance_costs: 5000 } });
    expect(h.flows).toEqual([
      { date: "2022-03-01", amount: -100000 },
      { date: "2023-01-01", amount: -800 },
      { date: TODAY, amount: 70000 },
    ]);
    expect(h.includes?.costs).toBe(true);
    const r = xirr(h.flows!);
    expect(r.ok && r.rate).toBeLessThan(0);
  });

  it("typed reasons", () => {
    expect(one({ ...car, metadata: {} }).unavailable).toBe("missing_purchase_price");
    expect(one({ ...car, purchase_date: null }).unavailable).toBe("missing_purchase_date");
    expect(one({ ...car, current_value: 0 }).unavailable).toBe("missing_value");
  });
});

describe("Equities", () => {
  const trade = (id: string, tradeDate: string, side: "buy" | "sell", quantity: number, price: number, extra = {}) => ({
    id,
    tradeDate,
    side,
    quantity,
    price,
    currency: "USD",
    source: "manual",
    ...extra,
  });
  const stock = asset({
    category: "Equities",
    name: "Brokerage Account / Saxo / ACME",
    ticker_symbol: "ACME",
    quantity: 60,
    current_value: 9000,
    metadata: {
      trades: [trade("t1", "2021-01-04", "buy", 100, 100), trade("t2", "2022-06-01", "sell", 40, 130)],
      income: [
        { date: "2021-12-01", amount: 50 },
        { date: "2030-01-01", amount: 77 },
      ],
    },
  });

  it("buys out, sells and past dividends in, current value as terminal; uses the booked amount when plausible", () => {
    const h = one(stock);
    expect(h.name).toBe("ACME");
    expect(h.flows).toEqual([
      { date: "2021-01-04", amount: -10000 },
      { date: "2021-12-01", amount: 50 },
      { date: "2022-06-01", amount: 5200 },
      { date: TODAY, amount: 9000 },
    ]);
    const booked = one({
      ...stock,
      metadata: { trades: [trade("t1", "2021-01-04", "buy", 100, 100, { bookedAmount: 10010 }), trade("t2", "2022-06-01", "sell", 40, 130)] },
    });
    expect(booked.flows![0].amount).toBe(-10010);
    expect(h.includes).toEqual({ purchase: true, income: true, currentValue: true, financing: true });
  });

  it("flags itemised-less income and refuses an incoherent ledger", () => {
    const noItems = one({ ...stock, metadata: { trades: stock.metadata!.trades, total_income: 200 } });
    expect(noItems.includes?.income).toBe(false);
    expect(one({ ...stock, quantity: 90 }).unavailable).toBe("missing_value");
    expect(one({ ...stock, metadata: {} }).unavailable).toBe("missing_purchase_price");
    expect(one({ ...stock, current_value: 0 }).unavailable).toBe("missing_value");
  });

  it("a fully sold position has no terminal flow", () => {
    const closed = one({
      ...stock,
      quantity: 0,
      current_value: 0,
      metadata: { trades: [trade("t1", "2021-01-04", "buy", 10, 100), trade("t2", "2022-01-04", "sell", 10, 120)] },
    });
    expect(closed.flows).toEqual([
      { date: "2021-01-04", amount: -1000 },
      { date: "2022-01-04", amount: 1200 },
    ]);
    expect(closed.includes?.currentValue).toBe(false);
  });
});

describe("SCPI, Private Equity, Startups, Exotic Assets", () => {
  it("SCPI: shares x price out, received dividends in", () => {
    const h = one(
      asset({
        category: "SCPI",
        quantity: 10,
        current_value: 8000,
        purchase_date: "2022-01-10",
        metadata: {
          subscription_price: 1000,
          financed_by_credit: true,
          dividends: [
            { id: "1", date: "2022-04-15", amount: 100, status: "received", quarter: "T1" },
            { id: "2", date: "2027-01-15", amount: 100, status: "expected", quarter: "T4" },
            { id: "3", date: "2026-10-15", amount: 100, status: "received", quarter: "future-dated" },
          ],
        },
      }),
    );
    expect(h.flows).toEqual([
      { date: "2022-01-10", amount: -10000 },
      { date: "2022-04-15", amount: 100 },
      { date: TODAY, amount: 8000 },
    ]);
    expect(h.includes?.financing).toBe(false);
  });

  it("Private Equity: paid calls only; distributions without dates are flagged, never invented", () => {
    const pe = asset({
      category: "Private Equity",
      current_value: 30000,
      metadata: {
        distributions_to_date: 5000,
        capital_calls: [
          { id: "1", due_date: "2022-01-01", amount: 10000, percentage: 10, status: "paid" },
          { id: "2", due_date: "2023-01-01", amount: 10000, percentage: 10, status: "paid" },
          { id: "3", due_date: "2027-01-01", amount: 10000, percentage: 10, status: "pending" },
        ],
        projected_distributions: [{ id: "d", due_date: "2025-01-01", amount: 99999 }],
      },
    });
    const h = one(pe);
    expect(h.flows).toEqual([
      { date: "2022-01-01", amount: -10000 },
      { date: "2023-01-01", amount: -10000 },
      { date: TODAY, amount: 30000 },
    ]);
    expect(h.includes?.income).toBe(false);
    expect(one({ ...pe, metadata: { called_capital_manual: 20000 } }).flows![0]).toEqual({ date: "2020-01-01", amount: -20000 });
    expect(one({ ...pe, metadata: {} }).unavailable).toBe("missing_purchase_price");
  });

  it("Startups: shares x average cost", () => {
    const h = one(asset({ category: "Startups", quantity: 200, current_value: 5000, metadata: { avg_cost_per_share: 10 } }));
    expect(h.flows![0].amount).toBe(-2000);
    expect(one(asset({ category: "Startups", quantity: 200, metadata: {} })).unavailable).toBe("missing_purchase_price");
  });

  it("Exotic Assets: per-unit price x units x ownership share", () => {
    const watch = asset({ category: "Exotic Assets", quantity: 1, current_value: 6000, metadata: { purchase_price: 10000 }, ownershipShare: 0.5 });
    expect(one(watch).flows![0].amount).toBe(-5000);
    expect(one({ ...watch, ownershipShare: undefined }).flows![0].amount).toBe(-10000);
  });
});

describe("unsupported categories", () => {
  it.each(["Cash", "Crypto", "Precious Metals", "Companies", "Liabilities", "Whatever"])("%s", (category) => {
    const h = one(asset({ category }));
    expect(h.unavailable).toBe("unsupported_category");
    expect(h.flows).toBeUndefined();
  });

  it("liabilities and uncategorised assets", () => {
    expect(one(asset({ category: "Real Estate", is_liability: true })).unavailable).toBe("unsupported_category");
    expect(one({ ...asset({ category: "x" }), asset_categories: null }).unavailable).toBe("unsupported_category");
  });
});

describe("currency conversion", () => {
  const eurCar = asset({
    category: "Vehicles",
    currency: "EUR",
    current_value: 70000,
    purchase_date: "2022-03-01",
    metadata: { purchase_price: 100000, expenses: [{ id: "x", date: "2023-01-02", category: "fuel", description: "", amount: 1000 }] },
  });

  it("lists the dates a foreign holding needs, and nothing for the base currency", () => {
    expect(collectHoldingFxRequests([eurCar], "USD", TODAY)).toEqual({ EUR: ["2022-03-01", "2023-01-02"] });
    expect(collectHoldingFxRequests([eurCar], "EUR", TODAY)).toEqual({});
    expect(collectHoldingFxRequests([asset({ category: "Cash", currency: "EUR" })], "USD", TODAY)).toEqual({});
  });

  it("converts each flow at its own date's rate and the terminal at today's rate", () => {
    const h = one(eurCar, { fxHistory: { EUR: { "2022-03-01": 1.1, "2023-01-02": 1.05 } } });
    expect(h.currency).toBe("USD");
    expect(h.flows![0].amount).toBeCloseTo(-110000, 6);
    expect(h.flows![1].amount).toBeCloseTo(-1050, 6);
    expect(h.flows![2].amount).toBeCloseTo(70000 / 0.9, 6); // RATES.EUR = 0.9 per USD
  });

  it("missing historical or current rate gives missing_fx, never a guess", () => {
    expect(one(eurCar, { fxHistory: { EUR: { "2022-03-01": 1.1 } } }).unavailable).toBe("missing_fx");
    expect(one(eurCar, { fxHistory: {} }).unavailable).toBe("missing_fx");
    const chf = { ...eurCar, currency: "CHF" };
    expect(one(chf, { fxHistory: { CHF: { "2022-03-01": 1, "2023-01-02": 1 } } }).unavailable).toBe("missing_fx");
  });

  it("works against a non-USD base with a USD-anchored table", () => {
    const usdCar = { ...eurCar, currency: "USD" };
    const h = one(usdCar, { base: "EUR", fxHistory: { USD: { "2022-03-01": 0.92, "2023-01-02": 0.94 } } });
    expect(h.flows![0].amount).toBeCloseTo(-92000, 6);
    expect(h.flows![2].amount).toBeCloseTo(70000 * 0.9, 6);
  });

  it("per-trade currencies are converted individually", () => {
    const stock = asset({
      category: "Equities",
      currency: "EUR",
      quantity: 10,
      current_value: 1500,
      metadata: {
        trades: [{ id: "t", tradeDate: "2021-01-04", side: "buy", quantity: 10, price: 100, currency: "GBP", source: "manual" }],
      },
    });
    const h = one(stock, { fxHistory: { GBP: { "2021-01-04": 1.3 } } });
    expect(h.flows![0].amount).toBeCloseTo(-1300, 6);
    expect(collectHoldingFxRequests([stock], "USD", TODAY)).toEqual({ GBP: ["2021-01-04"] });
  });
});

describe("builder contract", () => {
  it("keeps order, ids and output is plain JSON", () => {
    const hs = build([
      asset({ id: "x", category: "Cash", name: "Bank" }),
      asset({ id: "y", category: "Vehicles", name: "Car", current_value: 5, metadata: { purchase_price: 10 } }),
    ]);
    expect(hs.map((h) => h.id)).toEqual(["x", "y"]);
    expect(JSON.parse(JSON.stringify(hs))).toEqual(hs);
    expect(hs.every((h) => h.currency === "USD")).toBe(true);
  });

  it("a zero-quantity trade is not a usable cost", () => {
    const none = one(
      asset({
        category: "Equities",
        quantity: 0,
        current_value: 0,
        metadata: { trades: [{ id: "1", tradeDate: "2021-01-04", side: "buy", quantity: 0, price: 100, currency: "USD", source: "m" }] },
      }),
    );
    expect(none.unavailable).toBe("missing_purchase_price");
  });
});
