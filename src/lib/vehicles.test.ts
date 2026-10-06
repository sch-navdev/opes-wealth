import { describe, expect, it } from "vitest";
import {
  EMPTY_VEHICLE_METADATA,
  VEHICLE_EXPENSE_CATEGORIES,
  buildVehicleComparisonSeries,
  buildVehicleHistoryFromPurchase,
  calculateVehicleTotalCost,
  effectiveDepreciation,
  estimateDepreciatedValue,
  getVehicleMetadataErrors,
  isVehicleExpenseCategory,
  latestBlueBook,
  nextBlueBookId,
  nextVehicleExpenseId,
  parseVehicleMetadata,
  resolveVehicleValuation,
  sumVehicleExpenses,
  sumVehicleOwnershipCosts,
  vehicleExpensesByCategory,
  withEffectiveDepreciation,
  type BlueBookEntry,
  type VehicleExpense,
  type VehicleMetadata,
} from "@/lib/vehicles";

const meta = (patch: Partial<VehicleMetadata> = {}): VehicleMetadata => ({
  ...EMPTY_VEHICLE_METADATA,
  ...patch,
});

const exp = (category: VehicleExpense["category"], amount: number, date = "2025-01-01"): VehicleExpense => ({
  id: `${category}-${amount}-${date}`,
  date,
  category,
  description: "",
  amount,
});

const bb = (date: string, amount: number): BlueBookEntry => ({
  id: date,
  date,
  amount,
  currency: "",
  source: "Argus",
  document: "",
});

describe("expense helpers", () => {
  it("isVehicleExpenseCategory accepts only known categories", () => {
    for (const c of VEHICLE_EXPENSE_CATEGORIES) expect(isVehicleExpenseCategory(c)).toBe(true);
    for (const bad of ["Fuel", "", "unknown", 3, null, undefined]) expect(isVehicleExpenseCategory(bad)).toBe(false);
  });

  it("sumVehicleExpenses sums amounts (empty = 0)", () => {
    expect(sumVehicleExpenses([])).toBe(0);
    expect(sumVehicleExpenses([exp("fuel", 40), exp("tires", 600.5)])).toBe(640.5);
  });

  it("vehicleExpensesByCategory groups, counts and sorts largest first", () => {
    const out = vehicleExpensesByCategory([exp("fuel", 40), exp("tires", 600), exp("fuel", 60), exp("insurance", 300)]);
    expect(out).toEqual([
      { category: "tires", total: 600, count: 1 },
      { category: "insurance", total: 300, count: 1 },
      { category: "fuel", total: 100, count: 2 },
    ]);
    expect(vehicleExpensesByCategory([])).toEqual([]);
  });

  it("generates unique prefixed ids", () => {
    const ids = [nextVehicleExpenseId(), nextVehicleExpenseId(), nextBlueBookId(), nextBlueBookId()];
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toMatch(/^vexp-/);
    expect(ids[2]).toMatch(/^bb-/);
  });
});

describe("parseVehicleMetadata", () => {
  it("returns defaults for null / non-object input", () => {
    for (const raw of [null, undefined, "x", 5]) {
      expect(parseVehicleMetadata(raw)).toEqual(EMPTY_VEHICLE_METADATA);
    }
  });

  it("merges a partial older save over defaults", () => {
    const m = parseVehicleMetadata({ make: "Toyota", purchase_price: 90_000 });
    expect(m.make).toBe("Toyota");
    expect(m.purchase_price).toBe(90_000);
    expect(m.second_hand).toBe(false);
    expect(m.blue_book_log).toEqual([]);
    expect(m.expenses).toEqual([]);
  });

  it("migrates the legacy single Blue Book value into the log", () => {
    const m = parseVehicleMetadata({
      blue_book_value: 70_000,
      blue_book_date: "2024-05-01",
      blue_book_source: "Parkers",
      blue_book_document: "bb.pdf",
    });
    expect(m.blue_book_log).toEqual([
      { id: "bb-legacy", date: "2024-05-01", amount: 70_000, currency: "", source: "Parkers", document: "bb.pdf" },
    ]);
  });

  it("does not migrate a legacy value without a date or with a non-positive amount, nor when a log exists", () => {
    expect(parseVehicleMetadata({ blue_book_value: 70_000 }).blue_book_log).toEqual([]);
    expect(parseVehicleMetadata({ blue_book_value: 0, blue_book_date: "2024-01-01" }).blue_book_log).toEqual([]);
    const existing = [bb("2023-01-01", 1)];
    expect(
      parseVehicleMetadata({ blue_book_value: 70_000, blue_book_date: "2024-05-01", blue_book_log: existing }).blue_book_log,
    ).toEqual(existing);
  });

  it("sorts the Blue Book log by date ascending without mutating the input", () => {
    const log = [bb("2025-01-01", 3), bb("2023-01-01", 1), bb("2024-01-01", 2)];
    const m = parseVehicleMetadata({ blue_book_log: log });
    expect(m.blue_book_log.map((e) => e.amount)).toEqual([1, 2, 3]);
    expect(log[0].amount).toBe(3);
  });

  it("falls back to an empty expense ledger for a non-array", () => {
    expect(parseVehicleMetadata({ expenses: "bad" }).expenses).toEqual([]);
    expect(parseVehicleMetadata({ expenses: [exp("fuel", 5)] }).expenses).toHaveLength(1);
  });
});

describe("getVehicleMetadataErrors", () => {
  it("reports every missing required field", () => {
    expect(getVehicleMetadataErrors(meta())).toEqual([
      "vehicle_make_required",
      "vehicle_model_required",
      "vehicle_year_required",
      "vehicle_vin_required",
    ]);
  });

  it("treats whitespace-only values as missing and accepts a complete payload", () => {
    expect(getVehicleMetadataErrors(meta({ make: "  ", model: "X", year: "2020", vin: "V" }))).toEqual(["vehicle_make_required"]);
    expect(getVehicleMetadataErrors(meta({ make: "A", model: "B", year: "2020-2022", vin: "V" }))).toEqual([]);
  });
});

describe("ownership cost and total cost of ownership", () => {
  it("sums lump-sum cost fields and the expense ledger, ignoring nulls", () => {
    expect(sumVehicleOwnershipCosts(meta())).toBe(0);
    expect(
      sumVehicleOwnershipCosts(
        meta({ maintenance_costs: 100, modifications: 200, insurance_registration: 300, expenses: [exp("fuel", 50)] }),
      ),
    ).toBe(650);
  });

  it("total cost = baseline + ownership costs, never counting the purchase price twice", () => {
    expect(calculateVehicleTotalCost(meta({ purchase_price: 50_000, maintenance_costs: 1_000 }), 50_000)).toBe(51_000);
    expect(calculateVehicleTotalCost(meta(), 7_000)).toBe(7_000);
  });
});

describe("buildVehicleHistoryFromPurchase", () => {
  type Row = { recorded_date: string; value: number };
  const make = (d: string, v: number): Row => ({ recorded_date: d, value: v });
  const today = "2025-12-01";

  it("returns the input untouched without a purchase date or with a future one", () => {
    const h: Row[] = [make("2025-06-01", 80)];
    expect(buildVehicleHistoryFromPurchase(h, null, 100, today, make)).toBe(h);
    expect(buildVehicleHistoryFromPurchase(h, undefined, 100, today, make)).toBe(h);
    expect(buildVehicleHistoryFromPurchase(h, "2026-01-01", 100, today, make)).toBe(h);
  });

  it("starts on the purchase date at the purchase price and carries flat to today", () => {
    const out = buildVehicleHistoryFromPurchase([make("2025-06-01", 80)], "2025-01-01", 100, today, make);
    expect(out).toEqual([make("2025-01-01", 100), make("2025-06-01", 80), make("2025-12-01", 80)]);
  });

  it("with no price, anchors on the earliest kept valuation", () => {
    const out = buildVehicleHistoryFromPurchase([make("2025-06-01", 80), make("2025-08-01", 70)], "2025-01-01", null, today, make);
    expect(out[0]).toEqual(make("2025-01-01", 80));
    expect(out[out.length - 1]).toEqual(make("2025-12-01", 70));
  });

  it("with no price and only earlier rows, anchors on the last one before the purchase", () => {
    const out = buildVehicleHistoryFromPurchase([make("2024-01-01", 60), make("2024-06-01", 65)], "2025-01-01", 0, today, make);
    expect(out).toEqual([make("2025-01-01", 65), make("2025-12-01", 65)]);
  });

  it("drops rows before the purchase date", () => {
    const out = buildVehicleHistoryFromPurchase([make("2024-01-01", 999), make("2025-06-01", 80)], "2025-01-01", 100, today, make);
    expect(out.some((r) => r.recorded_date < "2025-01-01")).toBe(false);
  });

  it("the purchase price overrides a stored row on the purchase date; without a price the row stays", () => {
    const withPrice = buildVehicleHistoryFromPurchase([make("2025-01-01", 95)], "2025-01-01", 100, today, make);
    expect(withPrice[0]).toEqual(make("2025-01-01", 100));
    const noPrice = buildVehicleHistoryFromPurchase([make("2025-01-01", 95)], "2025-01-01", null, today, make);
    expect(noPrice[0]).toEqual(make("2025-01-01", 95));
  });

  it("with an empty history: a price gives a flat line, no price returns the (empty) input", () => {
    expect(buildVehicleHistoryFromPurchase([], "2025-01-01", 100, today, make)).toEqual([
      make("2025-01-01", 100),
      make("2025-12-01", 100),
    ]);
    expect(buildVehicleHistoryFromPurchase([], "2025-01-01", null, today, make)).toEqual([]);
  });

  it("does not duplicate today when the last row is already today, or when bought today", () => {
    const out = buildVehicleHistoryFromPurchase([make("2025-12-01", 70)], "2025-01-01", 100, today, make);
    expect(out.filter((r) => r.recorded_date === today)).toHaveLength(1);
    const bought = buildVehicleHistoryFromPurchase([], today, 100, today, make);
    expect(bought).toEqual([make(today, 100)]);
  });

  it("handles a leap-day purchase date", () => {
    const out = buildVehicleHistoryFromPurchase([], "2024-02-29", 100, "2025-02-28", make);
    expect(out.map((r) => r.recorded_date)).toEqual(["2024-02-29", "2025-02-28"]);
  });

  it("does not mutate the input history", () => {
    const h = [make("2025-06-01", 80)];
    buildVehicleHistoryFromPurchase(h, "2025-01-01", 100, today, make);
    expect(h).toEqual([make("2025-06-01", 80)]);
  });
});

describe("resolveVehicleValuation", () => {
  it("uses the purchase price as the baseline and the latest valuation as current", () => {
    const v = resolveVehicleValuation(
      meta({ purchase_price: 100_000 }),
      [
        { recorded_date: "2025-06-01", value: 75_000 },
        { recorded_date: "2024-01-01", value: 90_000 },
      ],
      1,
    );
    expect(v.baselineCost).toBe(100_000);
    expect(v.baselineSource).toBe("purchase_price");
    expect(v.baselineDate).toBeNull();
    expect(v.currentMarketValue).toBe(75_000);
    expect(v.change).toEqual({ amount: -25_000, percent: -25 });
  });

  it("falls back to the earliest valuation as baseline when there is no purchase price", () => {
    const v = resolveVehicleValuation(
      meta(),
      [
        { recorded_date: "2025-01-01", value: 75_000 },
        { recorded_date: "2024-01-01", value: 90_000 },
      ],
      0,
    );
    expect(v.baselineSource).toBe("first_valuation");
    expect(v.baselineDate).toBe("2024-01-01");
    expect(v.change?.amount).toBe(-15_000);
    expect(v.change?.percent).toBeCloseTo(-16.6667, 3);
  });

  it("reports appreciation as a positive change", () => {
    const v = resolveVehicleValuation(meta({ purchase_price: 50_000 }), [{ recorded_date: "2025-01-01", value: 60_000 }], 0);
    expect(v.change).toEqual({ amount: 10_000, percent: 20 });
  });

  it("reports no change with a single valuation and no purchase price", () => {
    const v = resolveVehicleValuation(meta(), [{ recorded_date: "2025-01-01", value: 60_000 }], 0);
    expect(v.baselineCost).toBeNull();
    expect(v.baselineSource).toBeNull();
    expect(v.change).toBeNull();
    expect(v.currentMarketValue).toBe(60_000);
  });

  it("uses the fallback value when the log is empty", () => {
    const v = resolveVehicleValuation(meta(), [], 42_000);
    expect(v.currentMarketValue).toBe(42_000);
    expect(v.change).toBeNull();
  });

  it("guards a zero/negative baseline (no divide-by-zero)", () => {
    const zeroPrice = resolveVehicleValuation(meta({ purchase_price: 0 }), [{ recorded_date: "2025-01-01", value: 10 }], 0);
    expect(zeroPrice.change).toBeNull();
    const zeroFirst = resolveVehicleValuation(
      meta(),
      [
        { recorded_date: "2024-01-01", value: 0 },
        { recorded_date: "2025-01-01", value: 10 },
      ],
      0,
    );
    expect(zeroFirst.change).toBeNull();
    expect(zeroFirst.baselineSource).toBeNull();
  });

  it("does not mutate the history order", () => {
    const h = [
      { recorded_date: "2025-01-01", value: 2 },
      { recorded_date: "2024-01-01", value: 1 },
    ];
    resolveVehicleValuation(meta(), h, 0);
    expect(h[0].value).toBe(2);
  });
});

describe("depreciation rates", () => {
  it("uses the brand-based suggestion by default (new Japanese car)", () => {
    expect(effectiveDepreciation(meta({ make: "Toyota", model: "Corolla" }), "2024-01-01")).toEqual({
      group: "japanese",
      first: -17.5,
      annual: -9,
    });
  });

  it("second-hand cars skip the showroom drop (first = annual) and old ones ease further", () => {
    const young = effectiveDepreciation(meta({ make: "Toyota", model: "X", second_hand: true, year: "2023" }), "2024-01-01");
    expect(young.first).toBe(-9);
    expect(young.annual).toBe(-9);
    const old = effectiveDepreciation(meta({ make: "Toyota", model: "X", second_hand: true, year: "2015" }), "2024-01-01");
    expect(old.first).toBe(old.annual);
    expect(old.annual).toBeGreaterThan(-9);
    expect(old.annual).toBeCloseTo(-6.75, 0);
  });

  it("uses manual rates only when flagged manual and both are set", () => {
    const manual = effectiveDepreciation(
      meta({ make: "Toyota", depreciation_manual: true, depreciation_first_year: -5, depreciation_annual: 3 }),
      "2024-01-01",
    );
    expect(manual).toMatchObject({ first: -5, annual: 3 });
    const incomplete = effectiveDepreciation(
      meta({ make: "Toyota", depreciation_manual: true, depreciation_first_year: -5, depreciation_annual: null }),
      "2024-01-01",
    );
    expect(incomplete).toMatchObject({ first: -17.5, annual: -9 });
    const notFlagged = effectiveDepreciation(
      meta({ make: "Toyota", depreciation_manual: false, depreciation_first_year: -5, depreciation_annual: 3 }),
      "2024-01-01",
    );
    expect(notFlagged).toMatchObject({ first: -17.5, annual: -9 });
  });

  it("a manual zero rate is honoured (not treated as missing)", () => {
    const r = effectiveDepreciation(
      meta({ depreciation_manual: true, depreciation_first_year: 0, depreciation_annual: 0 }),
      "2024-01-01",
    );
    expect(r).toMatchObject({ first: 0, annual: 0 });
  });

  it("withEffectiveDepreciation stores the rates in force and leaves other fields alone", () => {
    const out = withEffectiveDepreciation(meta({ make: "BMW", model: "320i", vin: "V" }), "2024-01-01");
    expect(out.depreciation_first_year).toBe(-30);
    expect(out.depreciation_annual).toBe(-17.5);
    expect(out.vin).toBe("V");
  });
});

describe("estimateDepreciatedValue (value curve)", () => {
  const toyota = meta({ make: "Toyota", model: "Corolla", purchase_price: 100_000 });

  it("is null without a positive price or a purchase date", () => {
    expect(estimateDepreciatedValue(meta({ purchase_price: null }), "2024-01-01", "2025-01-01")).toBeNull();
    expect(estimateDepreciatedValue(meta({ purchase_price: 0 }), "2024-01-01", "2025-01-01")).toBeNull();
    expect(estimateDepreciatedValue(toyota, null, "2025-01-01")).toBeNull();
    expect(estimateDepreciatedValue(toyota, "", "2025-01-01")).toBeNull();
  });

  it("equals the purchase price on the purchase day and for a future purchase date", () => {
    expect(estimateDepreciatedValue(toyota, "2025-01-01", "2025-01-01")).toBe(100_000);
    expect(estimateDepreciatedValue(toyota, "2026-01-01", "2025-01-01")).toBe(100_000);
  });

  it("applies the first-year drop then the annual rate, decreasing monotonically", () => {
    const y1 = estimateDepreciatedValue(toyota, "2024-01-01", "2025-01-01") as number;
    const y2 = estimateDepreciatedValue(toyota, "2024-01-01", "2026-01-01") as number;
    const y10 = estimateDepreciatedValue(toyota, "2015-01-01", "2025-01-01") as number;
    expect(y1).toBeGreaterThan(82_000);
    expect(y1).toBeLessThan(83_000);
    expect(y2).toBeCloseTo(75_075, -2);
    expect(y10).toBeLessThan(y2);
    expect(y10).toBeGreaterThan(0);
  });

  it("supports appreciation with a positive manual rate", () => {
    const collectible = meta({ purchase_price: 100_000, depreciation_manual: true, depreciation_first_year: 10, depreciation_annual: 10 });
    expect(estimateDepreciatedValue(collectible, "2024-01-01", "2026-01-01") as number).toBeGreaterThan(115_000);
  });

  // vehicle-depreciation.ts:99-100 (depreciatedValue): a rate below -100% makes the base negative and
  // Math.pow(negative, fractional) is NaN, which Math.max(0, NaN) lets through. Correct: clamp to 0.
  it.fails("never goes below zero, even with a rate beyond -100%", () => {
    const wreck = meta({ purchase_price: 100_000, depreciation_manual: true, depreciation_first_year: -150, depreciation_annual: -150 });
    const v = estimateDepreciatedValue(wreck, "2020-01-01", "2025-01-01") as number;
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it("second-hand cars use the annual rate from day one", () => {
    const used = meta({ make: "Toyota", model: "X", purchase_price: 100_000, second_hand: true, year: "2023" });
    const v = estimateDepreciatedValue(used, "2024-01-01", "2025-01-01") as number;
    expect(v).toBeGreaterThan(90_500);
    expect(v).toBeLessThan(91_500);
  });
});

describe("latestBlueBook", () => {
  it("returns the last log entry or null", () => {
    expect(latestBlueBook(meta())).toBeNull();
    expect(latestBlueBook(meta({ blue_book_log: [bb("2023-01-01", 1), bb("2024-01-01", 2)] }))?.amount).toBe(2);
  });
});

describe("buildVehicleComparisonSeries", () => {
  const today = "2025-01-01";

  it("builds market, purchase and Blue Book curves on one date axis", () => {
    const rows = buildVehicleComparisonSeries({
      market: [
        { recorded_date: "2024-06-01", value: 80 },
        { recorded_date: "2024-02-01", value: 90 },
        { recorded_date: "2023-01-01", value: 999 },
      ],
      purchaseDate: "2024-01-01",
      purchasePrice: 100,
      guide: [{ date: "2024-03-01", value: 85 }],
      today,
    });
    expect(rows).toEqual([
      { date: "2024-01-01", value: null, purchase: 100, blueBook: null },
      { date: "2024-02-01", value: 90, purchase: 100, blueBook: null },
      { date: "2024-03-01", value: null, purchase: 100, blueBook: 85 },
      { date: "2024-06-01", value: 80, purchase: 100, blueBook: null },
      { date: "2025-01-01", value: 80, purchase: 100, blueBook: null },
    ]);
  });

  it("never overwrites a market value that falls on the purchase date", () => {
    const rows = buildVehicleComparisonSeries({
      market: [{ recorded_date: "2024-01-01", value: 95 }],
      purchaseDate: "2024-01-01",
      purchasePrice: 100,
      guide: [],
      today,
    });
    expect(rows[0]).toEqual({ date: "2024-01-01", value: 95, purchase: 100, blueBook: null });
  });

  it("omits the purchase line without a positive price", () => {
    for (const price of [null, undefined, 0, -5]) {
      const rows = buildVehicleComparisonSeries({
        market: [{ recorded_date: "2024-02-01", value: 90 }],
        purchaseDate: "2024-01-01",
        purchasePrice: price,
        guide: [],
        today,
      });
      expect(rows.every((r) => r.purchase === null)).toBe(true);
      expect(rows.map((r) => r.date)).toEqual(["2024-02-01", "2025-01-01"]);
    }
  });

  it("does not put the purchase price on Blue Book points that predate the purchase", () => {
    const rows = buildVehicleComparisonSeries({
      market: [],
      purchaseDate: "2024-01-01",
      purchasePrice: 100,
      guide: [{ date: "2023-06-01", value: 70 }],
      today,
    });
    expect(rows[0]).toEqual({ date: "2023-06-01", value: null, purchase: null, blueBook: 70 });
    expect(rows[1]).toMatchObject({ date: "2024-01-01", purchase: 100 });
  });

  it("with a future purchase date, keeps all market rows and spans the price over them", () => {
    const rows = buildVehicleComparisonSeries({
      market: [{ recorded_date: "2024-02-01", value: 90 }],
      purchaseDate: "2030-01-01",
      purchasePrice: 100,
      guide: [],
      today,
    });
    expect(rows.map((r) => r.date)).toEqual(["2024-02-01", "2025-01-01"]);
    expect(rows.every((r) => r.purchase === 100)).toBe(true);
  });

  it("returns an empty series with no data at all", () => {
    expect(buildVehicleComparisonSeries({ market: [], purchaseDate: null, purchasePrice: null, guide: [], today })).toEqual([]);
  });

  it("does not add a carry-forward row when the last market value is today", () => {
    const rows = buildVehicleComparisonSeries({
      market: [{ recorded_date: today, value: 50 }],
      purchaseDate: null,
      purchasePrice: null,
      guide: [],
      today,
    });
    expect(rows).toEqual([{ date: today, value: 50, purchase: null, blueBook: null }]);
  });
});
