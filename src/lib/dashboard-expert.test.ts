import { describe, expect, it } from "vitest";
import {
  buildExpertPanelsData,
  summarizeTaxDepreciation,
  type ExpertAssetInput,
  type ExpertTaxRow,
} from "@/lib/dashboard-expert";

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
