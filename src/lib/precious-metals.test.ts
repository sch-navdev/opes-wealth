import { describe, expect, it } from "vitest";
import {
  DEFAULT_PURITY,
  EMPTY_PRECIOUS_METAL_METADATA,
  METAL_TYPES,
  calculateMetalValue,
  fineTroyOunces,
  getPreciousMetalErrors,
  parsePreciousMetalMetadata,
  toTroyOunces,
  type PreciousMetalMetadata,
} from "@/lib/precious-metals";

const G_PER_OZ = 31.1034768;

const meta = (over: Partial<PreciousMetalMetadata> = {}): PreciousMetalMetadata => ({
  ...EMPTY_PRECIOUS_METAL_METADATA,
  weight_per_unit: 1,
  weight_unit: "oz",
  purity: 1,
  ...over,
});

describe("parsePreciousMetalMetadata", () => {
  it("returns the defaults for null, undefined and non-objects", () => {
    expect(parsePreciousMetalMetadata(null)).toEqual(EMPTY_PRECIOUS_METAL_METADATA);
    expect(parsePreciousMetalMetadata(undefined)).toEqual(EMPTY_PRECIOUS_METAL_METADATA);
    expect(parsePreciousMetalMetadata("gold")).toEqual(EMPTY_PRECIOUS_METAL_METADATA);
    expect(parsePreciousMetalMetadata(42)).toEqual(EMPTY_PRECIOUS_METAL_METADATA);
  });

  it("merges stored fields over the defaults", () => {
    const parsed = parsePreciousMetalMetadata({ metal: "silver", weight_per_unit: 500, weight_unit: "g" });
    expect(parsed.metal).toBe("silver");
    expect(parsed.weight_per_unit).toBe(500);
    expect(parsed.weight_unit).toBe("g");
    expect(parsed.purity).toBe(EMPTY_PRECIOUS_METAL_METADATA.purity);
    expect(parsed.form).toBe("bar");
  });

  it("does not mutate the shared defaults", () => {
    parsePreciousMetalMetadata({ metal: "platinum" });
    expect(EMPTY_PRECIOUS_METAL_METADATA.metal).toBe("gold");
  });
});

describe("DEFAULT_PURITY", () => {
  it("has a valid fineness (0 < p <= 1) for every metal", () => {
    for (const m of METAL_TYPES) {
      expect(DEFAULT_PURITY[m]).toBeGreaterThan(0);
      expect(DEFAULT_PURITY[m]).toBeLessThanOrEqual(1);
    }
  });
});

describe("toTroyOunces", () => {
  it("troy ounces pass through unchanged", () => {
    expect(toTroyOunces(2.5, "oz")).toBe(2.5);
  });

  it("converts grams (31.1034768 g = 1 oz t)", () => {
    expect(toTroyOunces(G_PER_OZ, "g")).toBeCloseTo(1, 12);
    expect(toTroyOunces(100, "g")).toBeCloseTo(3.2150746568628, 9);
  });

  it("converts kilograms (1 kg = 32.1507466 oz t)", () => {
    expect(toTroyOunces(1, "kg")).toBeCloseTo(32.15074656862798, 9);
    expect(toTroyOunces(1, "kg")).toBeCloseTo(toTroyOunces(1000, "g"), 9);
  });

  it("zero stays zero in every unit", () => {
    expect(toTroyOunces(0, "g")).toBe(0);
    expect(toTroyOunces(0, "kg")).toBe(0);
    expect(toTroyOunces(0, "oz")).toBe(0);
  });
});

describe("fineTroyOunces", () => {
  it("pieces x weight x purity", () => {
    expect(fineTroyOunces(meta({ weight_per_unit: 1, weight_unit: "oz", purity: 0.9999 }), 10)).toBeCloseTo(9.999, 10);
  });

  it("converts the unit weight before applying purity and quantity: 2 x 1 kg at 0.999", () => {
    expect(fineTroyOunces(meta({ weight_per_unit: 1, weight_unit: "kg", purity: 0.999 }), 2)).toBeCloseTo(64.23719164411871, 8);
  });

  it("is 0 when the weight is missing, zero or negative", () => {
    expect(fineTroyOunces(meta({ weight_per_unit: null }), 5)).toBe(0);
    expect(fineTroyOunces(meta({ weight_per_unit: 0 }), 5)).toBe(0);
    expect(fineTroyOunces(meta({ weight_per_unit: -1 }), 5)).toBe(0);
  });

  it("is 0 for zero pieces", () => {
    expect(fineTroyOunces(meta(), 0)).toBe(0);
  });

  it("a 22k (0.9167) 1 oz coin holds 0.9167 oz of gold", () => {
    expect(fineTroyOunces(meta({ weight_per_unit: 1, purity: 0.9167 }), 1)).toBeCloseTo(0.9167, 12);
  });
});

describe("calculateMetalValue", () => {
  it("valued at spot with no premium: 10 x 1 oz at 2000 = 20000", () => {
    expect(calculateMetalValue(meta(), 10, 2000)).toBeCloseTo(20000, 8);
  });

  it("applies the dealer premium: +2% on 2 x 1 kg 0.999 at 2000/oz", () => {
    const m = meta({ weight_per_unit: 1, weight_unit: "kg", purity: 0.999, premium_pct: 2 });
    expect(calculateMetalValue(m, 2, 2000)).toBeCloseTo(131043.87095, 3);
    expect(calculateMetalValue({ ...m, premium_pct: null }, 2, 2000)).toBeCloseTo(128474.38329, 3);
    expect(calculateMetalValue({ ...m, premium_pct: 0 }, 2, 2000)).toBeCloseTo(128474.38329, 3);
  });

  it("a negative premium (discount to spot) lowers the value", () => {
    expect(calculateMetalValue(meta({ premium_pct: -10 }), 1, 1000)).toBeCloseTo(900, 8);
  });

  it("scales linearly with the spot price and quantity", () => {
    const m = meta({ weight_unit: "g", weight_per_unit: 100, purity: 0.999 });
    const one = calculateMetalValue(m, 1, 2000);
    expect(calculateMetalValue(m, 3, 2000)).toBeCloseTo(one * 3, 8);
    expect(calculateMetalValue(m, 1, 4000)).toBeCloseTo(one * 2, 8);
  });

  it("is 0 at zero spot, zero quantity, or no weight", () => {
    expect(calculateMetalValue(meta(), 5, 0)).toBe(0);
    expect(calculateMetalValue(meta(), 0, 2000)).toBe(0);
    expect(calculateMetalValue(meta({ weight_per_unit: null }), 5, 2000)).toBe(0);
  });

  it("a 31.1034768 g bar at purity 1 is worth exactly one ounce of spot", () => {
    expect(calculateMetalValue(meta({ weight_unit: "g", weight_per_unit: G_PER_OZ }), 1, 1850)).toBeCloseTo(1850, 8);
  });
});

describe("getPreciousMetalErrors", () => {
  it("no errors for a valid holding", () => {
    expect(getPreciousMetalErrors(meta({ purity: 0.999, premium_pct: 3 }))).toEqual([]);
  });

  it("requires a positive weight", () => {
    expect(getPreciousMetalErrors(meta({ weight_per_unit: null }))).toContain("metal_weight_required");
    expect(getPreciousMetalErrors(meta({ weight_per_unit: 0 }))).toContain("metal_weight_required");
    expect(getPreciousMetalErrors(meta({ weight_per_unit: -5 }))).toContain("metal_weight_required");
    expect(getPreciousMetalErrors(meta({ weight_per_unit: NaN }))).toContain("metal_weight_required");
  });

  it("purity must be in (0, 1]", () => {
    expect(getPreciousMetalErrors(meta({ purity: 1 }))).toEqual([]);
    expect(getPreciousMetalErrors(meta({ purity: 0.0001 }))).toEqual([]);
    for (const p of [0, -0.5, 1.0001, 999, NaN]) {
      expect(getPreciousMetalErrors(meta({ purity: p }))).toContain("metal_purity_invalid");
    }
  });

  it("premium may be null, zero, positive or down to -50 but not lower", () => {
    expect(getPreciousMetalErrors(meta({ premium_pct: null }))).toEqual([]);
    expect(getPreciousMetalErrors(meta({ premium_pct: -50 }))).toEqual([]);
    expect(getPreciousMetalErrors(meta({ premium_pct: 25 }))).toEqual([]);
    expect(getPreciousMetalErrors(meta({ premium_pct: -50.01 }))).toContain("metal_premium_invalid");
  });

  it("collects all errors at once", () => {
    expect(getPreciousMetalErrors(meta({ weight_per_unit: null, purity: 0, premium_pct: -90 }))).toEqual([
      "metal_weight_required",
      "metal_purity_invalid",
      "metal_premium_invalid",
    ]);
  });
});
