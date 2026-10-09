import { describe, expect, it } from "vitest";
import { EMPTY_VEHICLE_METADATA, type VehicleMetadata } from "@/lib/vehicles";
import { vehicleAnalysis, vehicleCurveRows } from "./vehicle";

// Invented fixture: bought 2023-01-01 for 50,000, worth 35,000 on 2025-01-01 (24 months ~ 731 days).
const MD: VehicleMetadata = {
  ...EMPTY_VEHICLE_METADATA,
  make: "Acme",
  model: "Roadster",
  purchase_price: 50000,
  mileage: 40000,
  second_hand: false,
  depreciation_manual: true,
  depreciation_first_year: -20,
  depreciation_annual: -10,
  maintenance_costs: 1000,
  expenses: [
    { id: "a", date: "2023-06-01", category: "fuel", description: "", amount: 1500 },
    { id: "b", date: "2024-03-01", category: "fuel", description: "", amount: 500 },
    { id: "c", date: "2024-05-01", category: "insurance", description: "", amount: 2000 },
  ],
};
const INPUT = {
  metadata: MD,
  currentValue: 35000,
  purchaseDate: "2023-01-01",
  today: "2025-01-01",
  market: [{ recorded_date: "2024-01-01", value: 41000 }],
  guide: [{ date: "2024-06-01", value: 36000 }],
};

describe("vehicleAnalysis", () => {
  it("derives residual value, value lost and the cost of ownership", () => {
    const a = vehicleAnalysis(INPUT);
    expect(a.residualPct).toBeCloseTo(0.7, 10);
    expect(a.valueLost).toBe(15000);
    expect(a.ledgerCosts).toBe(4000);
    expect(a.runningCosts).toBe(5000); // 4000 ledger + 1000 maintenance lump
    expect(a.totalCostOfOwnership).toBe(20000);
    expect(a.depreciationShare).toBeCloseTo(0.75, 10);
    expect(a.ownershipMonths).toBeCloseTo(731 / 30.4375, 6);
    expect(a.tcoPerMonth).toBeCloseTo(20000 / (731 / 30.4375), 6);
    expect(a.valueLostPerMonth).toBeCloseTo(15000 / (731 / 30.4375), 6);
    expect(a.tcoPerKm).toBeCloseTo(0.5, 10);
    expect(a.latestBlueBook).toBe(36000);
    expect(a.marketVsBlueBook).toBe(-1000);
    expect(a.costsByCategory[0]).toEqual({ category: "fuel", total: 2000, count: 2 });
  });

  it("is null, not 0, without a purchase price, mileage or purchase date", () => {
    const a = vehicleAnalysis({ ...INPUT, metadata: { ...MD, purchase_price: null, mileage: null }, purchaseDate: null, guide: [] });
    expect(a).toMatchObject({
      purchasePrice: null,
      residualPct: null,
      valueLost: null,
      ownershipMonths: null,
      valueLostPerMonth: null,
      totalCostOfOwnership: null,
      tcoPerMonth: null,
      tcoPerKm: null,
      depreciationShare: null,
      latestBlueBook: null,
      marketVsBlueBook: null,
    });
    expect(a.runningCosts).toBe(5000);
  });
});

describe("vehicleCurveRows", () => {
  it("merges the market, purchase, Blue Book step and modelled curves on one axis", () => {
    const rows = vehicleCurveRows(INPUT);
    expect(rows[0].date).toBe("2023-01-01");
    expect(rows[0].model).toBe(50000);
    expect(rows[rows.length - 1].date).toBe("2025-01-01");
    // After year one at -20 %, then -10 % a year: 50000 * 0.8 * 0.9^(731/365.25 - 1)
    const last = rows[rows.length - 1].model!;
    expect(last).toBeCloseTo(50000 * 0.8 * Math.pow(0.9, 731 / 365.25 - 1), 0);
    expect(rows.find((r) => r.date === "2024-06-01")?.blueBook).toBe(36000);
    expect(rows[rows.length - 1].blueBookStep).toBe(36000);
    // modelled values only fall
    const model = rows.filter((r) => r.model != null).map((r) => r.model!);
    expect([...model].sort((a, b) => b - a)).toEqual(model);
  });

  it("has no modelled curve without a purchase price", () => {
    const rows = vehicleCurveRows({ ...INPUT, metadata: { ...MD, purchase_price: null } });
    expect(rows.every((r) => r.model === null)).toBe(true);
  });
});
