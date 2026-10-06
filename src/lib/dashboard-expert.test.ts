import { describe, expect, it } from "vitest";
import {
  buildExpertPanelsData,
  classifyLiability,
  computeFinancialRatios,
  summarizeTaxDepreciation,
  type ExpertAssetInput,
  type ExpertTaxRow,
} from "@/lib/dashboard-expert";
import { convertToBaseCurrency } from "@/lib/fx";
import { assetLiability, grossAssetValue } from "@/lib/liabilities";
import { applyOwnershipFactors } from "@/lib/shared-assets/load";

const rates = { USD: 1, AED: 4 };
const TODAY = "2026-10-06";

function asset(over: Partial<ExpertAssetInput> & { id: string; category?: string | null }): ExpertAssetInput {
  const { category, ...rest } = over;
  return {
    name: over.id,
    quantity: 1,
    current_value: 0,
    currency: "USD",
    is_liability: false,
    metadata: null,
    purchase_date: "2024-01-01",
    asset_categories: category === null ? null : { name: category ?? "Cash" },
    ...rest,
  };
}

describe("buildExpertPanelsData - empty", () => {
  it("returns empty panels for no assets", () => {
    const d = buildExpertPanelsData([], "USD", rates, TODAY);
    expect(d.rawRows).toEqual([]);
    expect(d.privateEquity).toEqual([]);
    expect(d.taxDepreciation).toEqual([]);
    expect(d.exposure.cells).toEqual([]);
    expect(d.exposure.maxCell).toBe(0);
  });
});

describe("rawRows", () => {
  it("converts to base, signs liabilities negative and defaults the category", () => {
    const d = buildExpertPanelsData(
      [
        asset({ id: "a", current_value: 400, currency: "AED", quantity: 2 }),
        asset({ id: "l", current_value: 50, is_liability: true, category: "Loans" }),
        asset({ id: "n", current_value: 10, category: null, purchase_date: null }),
      ],
      "USD",
      rates,
      TODAY,
    );
    expect(d.rawRows).toHaveLength(3);
    expect(d.rawRows[0]).toMatchObject({ id: "a", nativeValue: 400, baseValue: 100, quantity: 2, currency: "AED", category: "Cash" });
    expect(d.rawRows[1]).toMatchObject({ baseValue: -50, isLiability: true });
    expect(d.rawRows[2]).toMatchObject({ category: "Uncategorised", purchaseDate: null });
  });

  it("is JSON-serialisable", () => {
    const d = buildExpertPanelsData([asset({ id: "a", current_value: 5 })], "USD", rates, TODAY);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
});

describe("privateEquity", () => {
  const pe = asset({
    id: "pe",
    category: "Private Equity",
    currency: "AED",
    current_value: 800,
    metadata: {
      manager: "Altaroc",
      vintage_year: "2024",
      commitment_amount: 2000,
      capital_calls: [
        { id: "1", due_date: "2024-03-31", amount: 400, percentage: 20, status: "paid" },
        { id: "2", due_date: "2027-03-31", amount: 400, percentage: 20, status: "pending" },
      ],
      distributions_to_date: 200,
      projected_distributions: [{ id: "d", due_date: "2030-03-31", amount: 1600 }],
    },
  });

  it("computes called, unfunded, NAV, DPI and TVPI in base currency", () => {
    const [row] = buildExpertPanelsData([pe], "USD", rates, TODAY).privateEquity;
    expect(row.commitment).toBe(500);
    expect(row.called).toBe(100);
    expect(row.unfunded).toBe(100 * 4); // 2000 - 400 = 1600 AED -> 400 USD
    expect(row.nav).toBe(200);
    expect(row.distributions).toBe(50);
    expect(row.dpi).toBeCloseTo(0.5);
    expect(row.tvpi).toBeCloseTo(2.5);
    expect(row.manager).toBe("Altaroc");
    expect(row.projectedMultiple).toBeCloseTo(2); // 1600 / 800 total scheduled calls
    expect(row.projectedIrr).not.toBeNull();
  });

  it("returns null ratios when nothing is called, and ignores non-PE assets", () => {
    const bare = asset({ id: "pe2", category: "Private Equity", current_value: 10, metadata: {} });
    const d = buildExpertPanelsData([bare, asset({ id: "c", current_value: 5 })], "USD", rates, TODAY);
    expect(d.privateEquity).toHaveLength(1);
    expect(d.privateEquity[0]).toMatchObject({ commitment: null, called: 0, dpi: null, tvpi: null });
    expect(d.taxDepreciation).toEqual([]);
  });
});

describe("taxDepreciation", () => {
  it("builds a vehicle row with a depreciated book value", () => {
    const car = asset({
      id: "car",
      category: "Vehicles",
      current_value: 30000,
      purchase_date: "2024-10-06",
      metadata: {
        make: "Toyota",
        model: "Corolla",
        year: "2024",
        purchase_price: 40000,
        depreciation_manual: true,
        depreciation_first_year: -10,
        depreciation_annual: -10,
      },
    });
    const [row] = buildExpertPanelsData([car], "USD", rates, TODAY).taxDepreciation;
    expect(row.kind).toBe("vehicle");
    expect(row.costBasis).toBe(40000);
    expect(row.marketValue).toBe(30000);
    // ~2 years at -10%/yr from 40000 = ~32400
    expect(row.bookValue).toBeGreaterThan(32000);
    expect(row.bookValue).toBeLessThan(32800);
  });

  it("skips vehicles without a purchase price, and uses gross market value for real estate", () => {
    const noPrice = asset({ id: "v", category: "Vehicles", current_value: 1, metadata: { make: "x" } });
    const home = asset({
      id: "re",
      category: "Real Estate",
      current_value: 600, // equity
      metadata: { market_valuation: 1000, contract_price: 800 },
    });
    const d = buildExpertPanelsData([noPrice, home], "USD", rates, TODAY);
    expect(d.taxDepreciation).toHaveLength(1);
    expect(d.taxDepreciation[0]).toMatchObject({ kind: "real_estate", marketValue: 1000, bookValue: null });
    expect(d.taxDepreciation[0].costBasis).toBeGreaterThanOrEqual(800);
  });
});

describe("exposure", () => {
  it("groups positive gross values by native currency x category in base currency, excluding liabilities", () => {
    const d = buildExpertPanelsData(
      [
        asset({ id: "1", current_value: 400, currency: "AED", category: "Cash" }),
        asset({ id: "2", current_value: 100, currency: "USD", category: "Cash" }),
        asset({ id: "3", current_value: 100, currency: "USD", category: "Stocks" }),
        asset({ id: "4", current_value: 999, currency: "USD", category: "Loans", is_liability: true }),
      ],
      "USD",
      rates,
      TODAY,
    );
    expect(d.exposure.currencies.map((c) => c.currency).sort()).toEqual(["AED", "USD"]);
    expect(d.exposure.categories).not.toContain("Loans");
    expect(d.exposure.maxCell).toBe(100);
    expect(d.exposure.cells.reduce((s, c) => s + c.share, 0)).toBeCloseTo(100);
  });
});

describe("summarizeTaxDepreciation", () => {
  const rows: ExpertTaxRow[] = [
    { id: "v", name: "Car", kind: "vehicle", costBasis: 100, marketValue: 90, bookValue: 70 },
    { id: "r", name: "Flat", kind: "real_estate", costBasis: 200, marketValue: 300, bookValue: null },
    { id: "p", name: "Fund", kind: "private_equity", costBasis: 100, marketValue: 150, bookValue: null },
  ];

  it("market view: nets gains for the portfolio figure but taxes positive gains only", () => {
    const s = summarizeTaxDepreciation(rows, { depreciationView: false, applyTax: true, ratePercent: 10 });
    expect(s.totalCost).toBe(400);
    expect(s.totalValue).toBe(540);
    expect(s.netUnrealisedGain).toBe(140);
    expect(s.taxableGain).toBe(150); // 100 + 50, the car's -10 is not offset
    expect(s.estimatedTax).toBe(15);
  });

  it("depreciation view swaps vehicles to book value only", () => {
    const s = summarizeTaxDepreciation(rows, { depreciationView: true, applyTax: false, ratePercent: 10 });
    expect(s.rows[0]).toMatchObject({ value: 70, gain: -30 });
    expect(s.rows[1].value).toBe(300);
    expect(s.totalValue).toBe(520);
    expect(s.estimatedTax).toBe(0);
  });

  it("falls back to market value when a vehicle has no book value, and clamps/defaults the rate", () => {
    const noBook = [{ ...rows[0], bookValue: null }];
    expect(summarizeTaxDepreciation(noBook, { depreciationView: true, applyTax: true, ratePercent: 5 }).rows[0].value).toBe(90);
    expect(summarizeTaxDepreciation(rows, { depreciationView: false, applyTax: true, ratePercent: 500 }).estimatedTax).toBe(150);
    expect(summarizeTaxDepreciation(rows, { depreciationView: false, applyTax: true, ratePercent: -3 }).estimatedTax).toBe(0);
    expect(summarizeTaxDepreciation(rows, { depreciationView: false, applyTax: true, ratePercent: NaN }).estimatedTax).toBe(0);
  });

  it("handles no rows", () => {
    const s = summarizeTaxDepreciation([], { depreciationView: true, applyTax: true, ratePercent: 20 });
    expect(s).toMatchObject({ totalCost: 0, totalValue: 0, taxableGain: 0, estimatedTax: 0 });
  });
});

/**
 * Co-ownership. The assets handed to `buildExpertPanelsData` are ALREADY the
 * viewer's pro-rata share (`scaleAssetForOwner`, applied by
 * `shared-assets/load.ts` before the page builds the panels), so the builder
 * must NOT scale again. These tests pin that contract: feeding the scaled copy
 * of an asset yields exactly the owned fraction of every money figure and
 * identical ratios — which would break if the builder applied a second
 * ownership factor (it would give a quarter, not a half).
 */
describe("co-ownership: panels fed pro-rata (already scaled) assets", () => {
  const F = 0.5;

  const fund = asset({
    id: "pe",
    category: "Private Equity",
    currency: "AED",
    current_value: 800,
    metadata: {
      commitment_amount: 2000,
      capital_calls: [
        { id: "1", due_date: "2024-03-31", amount: 400, percentage: 20, status: "paid" },
        { id: "2", due_date: "2027-03-31", amount: 400, percentage: 20, status: "pending" },
      ],
      distributions_to_date: 200,
      projected_distributions: [{ id: "d", due_date: "2030-03-31", amount: 1600 }],
    },
  });
  const car = asset({
    id: "car",
    category: "Vehicles",
    current_value: 30000,
    purchase_date: "2024-10-06",
    metadata: {
      make: "Toyota",
      model: "Corolla",
      year: "2024",
      purchase_price: 40000,
      maintenance_costs: 2000,
      depreciation_manual: true,
      depreciation_first_year: -10,
      depreciation_annual: -10,
    },
  });
  const flat = asset({
    id: "re",
    category: "Real Estate",
    current_value: 600, // equity
    metadata: {
      market_valuation: 1000,
      contract_price: 800,
      agencyFees: 16,
      registration_fee_amount: 32,
      renovationFees: 20,
      linked_loan: { amount: 400, outstanding_principal: 400 },
    },
  });

  /** The real pipeline: `applyOwnershipFactors` (-> `scaleAssetForOwner`) over page rows, which carry the category as `asset_categories.name`. */
  const scaled = (a: ExpertAssetInput): ExpertAssetInput =>
    applyOwnershipFactors([{ ...a, profile_id: "owner" }], new Map([[a.id, F]]))[0];

  it("private equity: money is exactly half, DPI/TVPI/projected multiple are identical", () => {
    const [full] = buildExpertPanelsData([fund], "USD", rates, TODAY).privateEquity;
    const [half] = buildExpertPanelsData([scaled(fund)], "USD", rates, TODAY).privateEquity;
    expect(half.commitment).toBe(full.commitment! * F);
    expect(half.called).toBe(full.called * F);
    expect(half.unfunded).toBe(full.unfunded * F);
    expect(half.nav).toBe(full.nav * F);
    expect(half.distributions).toBe(full.distributions * F);
    expect(half.dpi).toBe(full.dpi);
    expect(half.tvpi).toBe(full.tvpi);
    expect(half.projectedMultiple).toBeCloseTo(full.projectedMultiple!);
    expect(half.projectedIrr).toBeCloseTo(full.projectedIrr!);
    // Not double-scaled: a second factor would give a quarter.
    expect(half.nav).not.toBe(full.nav * F * F);
  });

  it("private equity with only manual called capital scales the same way", () => {
    const manual = asset({
      id: "pe-m",
      category: "Private Equity",
      current_value: 600,
      metadata: { commitment_amount: 1000, called_capital_manual: 400, distributions_to_date: 100 },
    });
    const [full] = buildExpertPanelsData([manual], "USD", rates, TODAY).privateEquity;
    const [half] = buildExpertPanelsData([scaled(manual)], "USD", rates, TODAY).privateEquity;
    expect(half.called).toBe(full.called * F);
    expect(half.unfunded).toBe(full.unfunded * F);
    expect(half.dpi).toBe(full.dpi);
    expect(half.tvpi).toBe(full.tvpi);
  });

  it("vehicle: cost basis, market value, gain and depreciated book value are half", () => {
    const [full] = buildExpertPanelsData([car], "USD", rates, TODAY).taxDepreciation;
    const [half] = buildExpertPanelsData([scaled(car)], "USD", rates, TODAY).taxDepreciation;
    expect(half.costBasis).toBe(full.costBasis * F);
    expect(half.marketValue).toBe(full.marketValue * F);
    // Book value is rounded to cents on each side, so allow a cent of drift.
    expect(half.bookValue).toBeCloseTo(full.bookValue! * F, 1);

    const opts = { depreciationView: true, applyTax: false, ratePercent: 0 };
    const sFull = summarizeTaxDepreciation([full], opts);
    const sHalf = summarizeTaxDepreciation([half], opts);
    expect(sHalf.totalValue).toBeCloseTo(sFull.totalValue * F, 1);
    expect(sHalf.netUnrealisedGain).toBeCloseTo(sFull.netUnrealisedGain * F, 1);
    // Book value stays between the cost basis and zero, i.e. consistent with the scaled purchase price.
    expect(half.bookValue!).toBeLessThan(half.costBasis);
    expect(half.bookValue!).toBeGreaterThan(0);
  });

  it("real estate: cost basis (price + fees), gross market value and gain are half", () => {
    const [full] = buildExpertPanelsData([flat], "USD", rates, TODAY).taxDepreciation;
    const [half] = buildExpertPanelsData([scaled(flat)], "USD", rates, TODAY).taxDepreciation;
    expect(full.costBasis).toBe(800 + 16 + 32 + 20);
    expect(half.costBasis).toBe(full.costBasis * F);
    expect(half.marketValue).toBe(full.marketValue * F);
    const opts = { depreciationView: false, applyTax: true, ratePercent: 10 };
    const sFull = summarizeTaxDepreciation([full], opts);
    const sHalf = summarizeTaxDepreciation([half], opts);
    expect(sHalf.netUnrealisedGain).toBe(sFull.netUnrealisedGain * F);
    expect(sHalf.estimatedTax).toBeCloseTo(sFull.estimatedTax * F, 6);
  });

  it("raw rows and exposure are half too", () => {
    const all = [fund, car, flat];
    const full = buildExpertPanelsData(all, "USD", rates, TODAY);
    const half = buildExpertPanelsData(all.map(scaled), "USD", rates, TODAY);
    full.rawRows.forEach((r, i) => {
      expect(half.rawRows[i].nativeValue).toBeCloseTo(r.nativeValue * F, 6);
      expect(half.rawRows[i].baseValue).toBeCloseTo(r.baseValue * F, 6);
    });
    expect(half.exposure.maxCell).toBeCloseTo(full.exposure.maxCell * F, 6);
    // Shares are proportions: unchanged by the owned fraction.
    full.exposure.cells.forEach((c, i) => expect(half.exposure.cells[i].share).toBeCloseTo(c.share, 6));
  });
});

/* ---------- financial ratios (ROA, D/E, ROIC) ---------- */

describe("classifyLiability", () => {
  it("treats standalone loans and mortgages as bank debt (and an untyped liability as a loan)", () => {
    const loan = asset({ id: "l", category: "Liabilities", is_liability: true, current_value: 100, metadata: { liability_type: "loan" } });
    const mort = asset({ id: "m", category: "Liabilities", is_liability: true, current_value: 200, metadata: { liability_type: "mortgage" } });
    const bare = asset({ id: "b", category: "Liabilities", is_liability: true, current_value: 30, metadata: null });
    expect(classifyLiability(loan)).toEqual({ bank: 100, other: 0 });
    expect(classifyLiability(mort)).toEqual({ bank: 200, other: 0 });
    expect(classifyLiability(bare)).toEqual({ bank: 30, other: 0 });
  });

  it("treats credit cards and other debts as other liabilities", () => {
    const card = asset({ id: "c", category: "Liabilities", is_liability: true, current_value: 50, metadata: { liability_type: "credit_card" } });
    const other = asset({ id: "o", category: "Liabilities", is_liability: true, current_value: 70, metadata: { liability_type: "other" } });
    expect(classifyLiability(card)).toEqual({ bank: 0, other: 50 });
    expect(classifyLiability(other)).toEqual({ bank: 0, other: 70 });
  });

  it("splits real estate into the linked bank loan and the off-plan developer balance", () => {
    const re = asset({
      id: "re",
      category: "Real Estate",
      current_value: 500,
      metadata: { market_valuation: 1000, linked_loan: { amount: 400, outstanding_principal: 400 }, is_offplan: true, outstanding_balance: 100 },
    });
    expect(classifyLiability(re)).toEqual({ bank: 400, other: 100 });
    expect(assetLiability(re)).toBe(500);
  });

  it("treats private-equity pending capital calls as other, and plain assets as zero", () => {
    const pe = asset({
      id: "pe",
      category: "Private Equity",
      current_value: 300,
      metadata: { capital_calls: [{ id: "1", due_date: "2027-01-01", amount: 80, percentage: 8, status: "pending" }] },
    });
    expect(classifyLiability(pe)).toEqual({ bank: 0, other: 80 });
    expect(classifyLiability(asset({ id: "c", current_value: 10 }))).toEqual({ bank: 0, other: 0 });
  });
});

describe("computeFinancialRatios", () => {
  const liab = (id: string, value: number, type: string) =>
    asset({ id, category: "Liabilities", is_liability: true, current_value: value, metadata: { liability_type: type } });

  const portfolio = (): ExpertAssetInput[] => [
    asset({ id: "cash", category: "Cash", current_value: 200 }),
    asset({
      id: "re",
      category: "Real Estate",
      current_value: 600, // equity
      metadata: { market_valuation: 1000, linked_loan: { amount: 400, outstanding_principal: 400 } },
    }),
    asset({
      id: "pe",
      category: "Private Equity",
      current_value: 300,
      metadata: { capital_calls: [{ id: "1", due_date: "2027-01-01", amount: 80, percentage: 8, status: "pending" }] },
    }),
    liab("mort", 100, "mortgage"),
    liab("card", 50, "credit_card"),
  ];

  it("computes known numbers", () => {
    const r = computeFinancialRatios(portfolio(), 120, "USD", rates);
    expect(r.totals).toEqual({
      annualYield: 120,
      totalAssets: 1500, // 200 + 1000 + 300
      totalLiabilities: 630, // 400 + 80 + 100 + 50
      netWorth: 870,
      cashAssets: 200,
      otherLiabilities: 130, // 80 capital calls + 50 card (loan and mortgage excluded)
      investedCapital: 1170, // 1500 - 200 - 130
    });
    expect(r.roa).toBeCloseTo(120 / 1500, 10);
    expect(r.debtToEquity).toBeCloseTo(630 / 870, 10);
    expect(r.roic).toBeCloseTo(120 / 1170, 10);
  });

  it("totals match the dashboard page formulas for total assets and total liabilities", () => {
    const list = [...portfolio(), asset({ id: "aed", category: "Cash", currency: "AED", current_value: 400 })];
    const pageAssets = list
      .filter((a) => !a.is_liability)
      .reduce((s, a) => s + convertToBaseCurrency(grossAssetValue(a), a.currency, "USD", rates), 0);
    const pageLiabs = list.reduce((s, a) => s + convertToBaseCurrency(assetLiability(a), a.currency, "USD", rates), 0);
    const { totals } = computeFinancialRatios(list, 0, "USD", rates);
    expect(totals.totalAssets).toBe(pageAssets);
    expect(totals.totalLiabilities).toBe(pageLiabs);
    expect(totals.netWorth).toBe(pageAssets - pageLiabs);
    expect(totals.cashAssets).toBe(300); // 200 + 400 AED / 4
  });

  it("excludes only cash (not other categories) from invested capital", () => {
    const only = [asset({ id: "c", category: "Cash", current_value: 100 }), asset({ id: "s", category: "Equities", current_value: 100 })];
    const r = computeFinancialRatios(only, 10, "USD", rates);
    expect(r.totals.investedCapital).toBe(100);
    expect(r.roic).toBeCloseTo(0.1);
    expect(r.roa).toBeCloseTo(0.05);
  });

  it("returns nulls for an empty portfolio", () => {
    const r = computeFinancialRatios([], 0, "USD", rates);
    expect(r.roa).toBeNull();
    expect(r.debtToEquity).toBeNull();
    expect(r.roic).toBeNull();
    expect(r.totals.totalAssets).toBe(0);
  });

  it("returns null for a zero or negative denominator, never Infinity or NaN", () => {
    const cash = (v: number) => asset({ id: "c", category: "Cash", current_value: v });
    // Only cash: invested capital is 0 -> ROIC null, ROA fine.
    const cashOnly = computeFinancialRatios([cash(100)], 5, "USD", rates);
    expect(cashOnly.roic).toBeNull();
    expect(cashOnly.roa).toBeCloseTo(0.05);
    // Debts exceed assets: net worth negative -> D/E null.
    const under = computeFinancialRatios([cash(100), liab("l", 300, "loan")], 5, "USD", rates);
    expect(under.totals.netWorth).toBe(-200);
    expect(under.debtToEquity).toBeNull();
    // Net worth exactly 0 -> null too.
    const zero = computeFinancialRatios([cash(100), liab("l", 100, "loan")], 0, "USD", rates);
    expect(zero.debtToEquity).toBeNull();
    // Other liabilities swallow the invested capital -> negative denominator -> null.
    const swallowed = computeFinancialRatios([asset({ id: "s", category: "Equities", current_value: 100 }), liab("c", 150, "credit_card")], 5, "USD", rates);
    expect(swallowed.roic).toBeNull();
    for (const r of [cashOnly, under, zero, swallowed]) {
      for (const v of [r.roa, r.debtToEquity, r.roic]) expect(v === null || Number.isFinite(v)).toBe(true);
    }
    // A non-finite yield is treated as 0.
    expect(computeFinancialRatios([asset({ id: "s", category: "Equities", current_value: 100 })], NaN, "USD", rates).roa).toBe(0);
  });

  it("allows a zero numerator (no debt gives D/E = 0)", () => {
    const r = computeFinancialRatios([asset({ id: "s", category: "Equities", current_value: 100 })], 0, "USD", rates);
    expect(r.debtToEquity).toBe(0);
    expect(r.roa).toBe(0);
  });

  it("pro-rata (already scaled) input gives half the amounts and identical ratios", () => {
    const F = 0.5;
    const full = portfolio();
    const half = full.map((a) => applyOwnershipFactors([{ ...a, profile_id: "owner" }], new Map([[a.id, F]]))[0]);
    const rFull = computeFinancialRatios(full, 120, "USD", rates);
    const rHalf = computeFinancialRatios(half, 120 * F, "USD", rates);
    expect(rHalf.totals.totalAssets).toBeCloseTo(rFull.totals.totalAssets * F, 6);
    expect(rHalf.totals.totalLiabilities).toBeCloseTo(rFull.totals.totalLiabilities * F, 6);
    expect(rHalf.totals.otherLiabilities).toBeCloseTo(rFull.totals.otherLiabilities * F, 6);
    expect(rHalf.roa).toBeCloseTo(rFull.roa!, 8);
    expect(rHalf.debtToEquity).toBeCloseTo(rFull.debtToEquity!, 8);
    expect(rHalf.roic).toBeCloseTo(rFull.roic!, 8);
  });
});

describe("buildExpertPanelsData - ratios", () => {
  it("uses the passive-income projected annual total as the yield and is JSON-serialisable", () => {
    const rented = asset({
      id: "re",
      category: "Real Estate",
      current_value: 1000,
      metadata: {
        market_valuation: 1000,
        tenancy_contracts: [{ id: "t", tenant_name: "T", start_date: "2026-01-01", end_date: "2028-01-01", annual_rent: 120, contract_value: null, imported_from_file: "", uploaded_at: "" }],
      },
    });
    const d = buildExpertPanelsData([rented], "USD", rates, TODAY);
    expect(d.ratios.totals.annualYield).toBeCloseTo(120, 6);
    expect(d.ratios.roa).toBeCloseTo(0.12, 6);
    expect(JSON.parse(JSON.stringify(d.ratios))).toEqual(d.ratios);
  });

  it("is all-null for an empty portfolio", () => {
    const d = buildExpertPanelsData([], "USD", rates, TODAY);
    expect(d.ratios).toMatchObject({ roa: null, debtToEquity: null, roic: null });
  });
});
