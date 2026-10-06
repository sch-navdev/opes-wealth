import { describe, expect, it } from "vitest";
import {
  DEPRECIATION_DEFAULTS,
  ageAtPurchase,
  depreciatedValue,
  depreciationGroup,
  suggestDepreciation,
  yearsBetween,
} from "@/lib/vehicle-depreciation";

describe("depreciationGroup", () => {
  it.each([
    ["Toyota", "Corolla", "japanese"],
    ["Honda", "Civic", "japanese"],
    ["Nissan", "Altima", "japanese"],
    ["Lexus", "RX 350", "japanese"],
    ["BMW", "X5", "european_luxury"],
    ["Mercedes-Benz", "C 200", "european_luxury"],
    ["Land Rover", "Defender", "european_luxury"],
    ["Porsche", "911", "sports"],
    ["Ferrari", "488", "sports"],
    ["Tesla", "Model 3", "electric"],
    ["BYD", "Atto 3", "electric"],
    ["Ford", "Focus", "general"],
    ["", "", "general"],
  ] as const)("%s %s -> %s", (make, model, expected) => {
    expect(depreciationGroup(make, model)).toBe(expected);
  });

  it("is case- and whitespace-insensitive on the make", () => {
    expect(depreciationGroup("  TOYOTA ", "Yaris")).toBe("japanese");
    expect(depreciationGroup("bmw", "320i")).toBe("european_luxury");
  });

  it("flags EV models by name even for a non-EV make", () => {
    expect(depreciationGroup("BMW", "i4")).toBe("electric");
    expect(depreciationGroup("BMW", "iX3")).toBe("electric");
    expect(depreciationGroup("Audi", "e-tron GT")).toBe("electric");
    expect(depreciationGroup("Hyundai", "Ioniq 5")).toBe("electric");
    expect(depreciationGroup("Mercedes-Benz", "EQS 450")).toBe("electric");
    expect(depreciationGroup("Volkswagen", "ID.4")).toBe("electric");
    expect(depreciationGroup("Porsche", "Taycan")).toBe("electric"); // EV beats the sports make
  });

  it("flags luxury SUVs by model regardless of (Japanese) make", () => {
    expect(depreciationGroup("Toyota", "Land Cruiser")).toBe("luxury_suv");
    expect(depreciationGroup("Toyota", "Prado")).toBe("luxury_suv");
    expect(depreciationGroup("Nissan", "Patrol")).toBe("luxury_suv");
    expect(depreciationGroup("Lexus", "LX 600")).toBe("luxury_suv");
  });

  // BUG (vehicle-depreciation.ts:42): EV_MODEL's `i[3-8x]\d?` also matches the
  // Hyundai i30 / i40, which are petrol/diesel cars, so they get the EV curve.
  it.fails("does not treat a Hyundai i30 (petrol hatchback) as electric", () => {
    expect(depreciationGroup("Hyundai", "i30")).toBe("general");
  });
});

describe("DEPRECIATION_DEFAULTS", () => {
  it("every group depreciates (negative) and the first year is no gentler than later years", () => {
    for (const rates of Object.values(DEPRECIATION_DEFAULTS)) {
      expect(rates.first).toBeLessThan(0);
      expect(rates.annual).toBeLessThan(0);
      expect(rates.first).toBeLessThanOrEqual(rates.annual);
    }
  });

  it("Japanese brands hold value better than European luxury and EVs", () => {
    expect(DEPRECIATION_DEFAULTS.japanese.annual).toBeGreaterThan(DEPRECIATION_DEFAULTS.european_luxury.annual);
    expect(DEPRECIATION_DEFAULTS.japanese.annual).toBeGreaterThan(DEPRECIATION_DEFAULTS.electric.annual);
  });
});

describe("suggestDepreciation", () => {
  it("a new car gets the group's showroom + annual rates", () => {
    expect(suggestDepreciation({ make: "Toyota", model: "Corolla", secondHand: false, ageAtPurchase: null })).toEqual({
      group: "japanese",
      first: -17.5,
      annual: -9,
    });
  });

  it("a new car ignores age", () => {
    const r = suggestDepreciation({ make: "Ford", model: "Focus", secondHand: false, ageAtPurchase: 10 });
    expect(r).toEqual({ group: "general", first: -25, annual: -12.5 });
  });

  it("a second-hand car skips the showroom drop: first = annual", () => {
    expect(suggestDepreciation({ make: "Ford", model: "Focus", secondHand: true, ageAtPurchase: 2 })).toEqual({
      group: "general",
      first: -12.5,
      annual: -12.5,
    });
    expect(suggestDepreciation({ make: "Ford", model: "Focus", secondHand: true, ageAtPurchase: null })).toEqual({
      group: "general",
      first: -12.5,
      annual: -12.5,
    });
  });

  it("a second-hand car 4 years old is not yet eased; 5+ years is eased to 75% (1 decimal)", () => {
    expect(suggestDepreciation({ make: "BMW", model: "X5", secondHand: true, ageAtPurchase: 4 }).annual).toBe(-17.5);
    const eased = suggestDepreciation({ make: "BMW", model: "X5", secondHand: true, ageAtPurchase: 5 });
    expect(eased.annual).toBeCloseTo(-13.1, 10); // -17.5 * 0.75 = -13.125
    expect(eased.first).toBe(eased.annual);
    const older = suggestDepreciation({ make: "Ford", model: "Focus", secondHand: true, ageAtPurchase: 12 });
    expect(older.annual).toBeCloseTo(-9.4, 10); // -12.5 * 0.75 = -9.375
  });
});

describe("ageAtPurchase", () => {
  it("is the purchase year minus the model year", () => {
    expect(ageAtPurchase("2019", "2024-05-01")).toBe(5);
    expect(ageAtPurchase("2024", "2024-12-31")).toBe(0);
  });

  it("never negative (bought before the model year, e.g. a pre-order)", () => {
    expect(ageAtPurchase("2025", "2024-03-01")).toBe(0);
  });

  it("null when either side is missing or implausible", () => {
    expect(ageAtPurchase("", "2024-01-01")).toBeNull();
    expect(ageAtPurchase("abc", "2024-01-01")).toBeNull();
    expect(ageAtPurchase("2019", null)).toBeNull();
    expect(ageAtPurchase("2019", undefined)).toBeNull();
    expect(ageAtPurchase("2019", "")).toBeNull();
    expect(ageAtPurchase("2019", "not-a-date")).toBeNull();
    expect(ageAtPurchase("1899", "2024-01-01")).toBeNull();
    expect(ageAtPurchase("2101", "2024-01-01")).toBeNull();
  });

  it("parses a leading year out of a free-text model year", () => {
    expect(ageAtPurchase("2018 facelift", "2023-01-01")).toBe(5);
  });
});

describe("yearsBetween", () => {
  it("is ~1 for a year apart (365.25-day year)", () => {
    expect(yearsBetween("2024-01-01", "2025-01-01")).toBeCloseTo(366 / 365.25, 6);
    expect(yearsBetween("2025-01-01", "2026-01-01")).toBeCloseTo(365 / 365.25, 6);
  });

  it("exactly 365.25 days = 1 year", () => {
    expect(yearsBetween("2024-01-01T00:00:00Z", "2024-12-31T06:00:00Z")).toBeCloseTo(1, 10);
  });

  it("zero for equal, reversed, or unparsable dates (never negative)", () => {
    expect(yearsBetween("2025-01-01", "2025-01-01")).toBe(0);
    expect(yearsBetween("2026-01-01", "2025-01-01")).toBe(0);
    expect(yearsBetween("garbage", "2025-01-01")).toBe(0);
    expect(yearsBetween("2025-01-01", "")).toBe(0);
  });
});

describe("depreciatedValue", () => {
  const rates = { first: -25, annual: -12.5 };

  it("zero or negative years returns the price", () => {
    expect(depreciatedValue(100000, rates, 0, false)).toBe(100000);
    expect(depreciatedValue(100000, rates, -3, false)).toBe(100000);
  });

  it("one year applies the first-year rate only", () => {
    expect(depreciatedValue(100000, rates, 1, false)).toBe(75000);
  });

  it("two years compounds first then annual: 100000 x 0.75 x 0.875", () => {
    expect(depreciatedValue(100000, rates, 2, false)).toBe(65625);
  });

  it("three years: 100000 x 0.75 x 0.875^2", () => {
    expect(depreciatedValue(100000, rates, 3, false)).toBe(57421.88); // 57421.875 rounded to cents
  });

  it("pro-rates inside the first year (geometric): half a year = 0.75^0.5", () => {
    expect(depreciatedValue(100000, rates, 0.5, false)).toBe(86602.54);
  });

  it("second-hand cars use the annual rate from day one", () => {
    expect(depreciatedValue(100000, rates, 1, true)).toBe(87500);
    expect(depreciatedValue(100000, rates, 2, true)).toBeCloseTo(100000 * 0.875 * 0.875, 2);
  });

  it("is monotonically decreasing over time for negative rates", () => {
    let prev = Infinity;
    for (const y of [0, 0.25, 0.5, 1, 1.5, 2, 5, 10]) {
      const v = depreciatedValue(50000, rates, y, false);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it("positive rates appreciate (collectibles)", () => {
    expect(depreciatedValue(100000, { first: 10, annual: 5 }, 1, false)).toBe(110000);
    expect(depreciatedValue(100000, { first: 10, annual: 5 }, 2, false)).toBe(115500);
  });

  it("a -100% rate floors at zero and stays there", () => {
    expect(depreciatedValue(100000, { first: -100, annual: -12.5 }, 1, false)).toBe(0);
    expect(depreciatedValue(100000, { first: -100, annual: -12.5 }, 5, false)).toBe(0);
  });

  it("zero price stays zero; 0% rates keep the price", () => {
    expect(depreciatedValue(0, rates, 3, false)).toBe(0);
    expect(depreciatedValue(42000, { first: 0, annual: 0 }, 7, false)).toBe(42000);
  });

  it("rounds to cents", () => {
    const v = depreciatedValue(12345.67, rates, 1.37, false);
    expect(Math.round(v * 100)).toBeCloseTo(v * 100, 6);
  });
});
