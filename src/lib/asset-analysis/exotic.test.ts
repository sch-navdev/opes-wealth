import { describe, expect, it } from "vitest";
import { EMPTY_EXOTIC_METADATA } from "@/lib/exotic-assets";
import { exoticAnalysis } from "./exotic";

describe("exoticAnalysis", () => {
  const md = { ...EMPTY_EXOTIC_METADATA, purchase_price: 10_000 };
  const history = [{ date: "2023-01-01", value: 10_000 }, { date: "2025-01-01", value: 12_100 }];

  it("computes the gain, holding period and compound growth (10,000 to 12,100 in 2 years = 10 %)", () => {
    const a = exoticAnalysis({ metadata: md, marketValue: 12_100, purchaseDate: "2023-01-01", history, today: "2025-01-01" });
    expect(a.gain?.amount).toBe(2_100);
    expect(a.gain?.percent).toBeCloseTo(21, 10);
    expect(a.holdingYears).toBeCloseTo(731 / 365, 6);
    expect(a.annualisedGrowth).toBeCloseTo(Math.pow(1.21, 365 / 731) - 1, 8);
    expect(a.sinceFirstAppraisal?.amount).toBe(2_100);
  });

  it("reads an insured value only when the record has one", () => {
    const base = { metadata: md, marketValue: 12_100, purchaseDate: "2023-01-01", history, today: "2025-01-01" };
    expect(exoticAnalysis(base).insuredValue).toBeNull();
    const a = exoticAnalysis({ ...base, rawMetadata: { insured_value: 15_000 } });
    expect(a.insuredValue).toBe(15_000);
    expect(a.insuredGap).toBe(2_900);
  });

  it("is null without a purchase price or date", () => {
    const a = exoticAnalysis({ metadata: EMPTY_EXOTIC_METADATA, marketValue: 5, purchaseDate: null, history: [], today: "2025-01-01" });
    expect(a).toMatchObject({ purchasePrice: null, gain: null, holdingYears: null, annualisedGrowth: null, sinceFirstAppraisal: null });
  });
});
