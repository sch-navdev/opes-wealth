import { describe, expect, it } from "vitest";
import { EMPTY_PRECIOUS_METAL_METADATA, calculateMetalValue } from "@/lib/precious-metals";
import { metalAnalysis } from "./metals";

// Invented fixture: 3 bars of 100 g, purity 0.999, spot 2000 per troy oz, premium 5 %.
const MD = { ...EMPTY_PRECIOUS_METAL_METADATA, weight_per_unit: 100, weight_unit: "g" as const, purity: 0.999, premium_pct: 5, last_spot_price: 2000 };

describe("metalAnalysis", () => {
  it("computes weight, spot value and the premium over spot", () => {
    const fine = (300 / 31.1034768) * 0.999;
    const value = calculateMetalValue(MD, 3, 2000); // fine * 2000 * 1.05
    const a = metalAnalysis({ metadata: MD, quantity: 3, currentValue: value, history: [] });
    expect(a.grossGrams).toBeCloseTo(300, 6);
    expect(a.fineOunces).toBeCloseTo(fine, 8);
    expect(a.spotValue).toBeCloseTo(fine * 2000, 6);
    expect(a.premiumAmount).toBeCloseTo(fine * 2000 * 0.05, 6);
    expect(a.premiumPct).toBeCloseTo(0.05, 10);
    expect(a.statedPremiumPct).toBe(0.05);
    expect(a.pricePerFineOunce).toBeCloseTo(2100, 6);
  });

  it("is null (not 0) when the weight or the spot is unknown", () => {
    const a = metalAnalysis({ metadata: { ...EMPTY_PRECIOUS_METAL_METADATA, weight_per_unit: null }, quantity: 3, currentValue: 5000, history: [] });
    expect(a).toMatchObject({ grossGrams: null, fineOunces: null, spotValue: null, premiumAmount: null, premiumPct: null, pricePerFineOunce: null });
    const noSpot = metalAnalysis({ metadata: { ...MD, last_spot_price: null }, quantity: 3, currentValue: 5000, history: [] });
    expect(noSpot.spotValue).toBeNull();
    expect(noSpot.fineOunces).not.toBeNull();
  });

  it("reports the change since the first recorded value", () => {
    const a = metalAnalysis({ metadata: MD, quantity: 3, currentValue: 6000, history: [{ date: "2025-01-01", value: 5000 }, { date: "2025-06-01", value: 6000 }] });
    expect(a.sinceFirstRecord?.pct).toBeCloseTo(0.2, 10);
  });
});
