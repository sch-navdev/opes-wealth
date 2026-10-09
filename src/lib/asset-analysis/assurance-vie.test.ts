import { describe, expect, it } from "vitest";
import { EMPTY_ASSURANCE_VIE_METADATA, type AssuranceVieMetadata } from "@/lib/assurance-vie";
import { assuranceVieAnalysis } from "./assurance-vie";

// Invented contract opened 2020-01-01 -> 8-year milestone on 2028-01-01 (2,922 days).
const MD: AssuranceVieMetadata = { ...EMPTY_ASSURANCE_VIE_METADATA, opened_on: "2020-01-01", premiums_paid_total: 40_000, euro_fund_pct: 70, uc_pct: 30 };

describe("assuranceVieAnalysis", () => {
  it("compares value with premiums paid", () => {
    const a = assuranceVieAnalysis({ metadata: MD, value: 46_000, today: "2024-01-01" });
    expect(a.difference).toBe(6_000);
    expect(a.differencePct).toBeCloseTo(0.15, 10);
    expect(a.statedAllocation).toEqual({ euro: 70, uc: 30 });
  });

  it("places today on the 8-year timeline", () => {
    const a = assuranceVieAnalysis({ metadata: MD, value: 1, today: "2024-01-01" });
    expect(a.timeline?.target).toBe("2028-01-01");
    expect(a.timeline?.reached).toBe(false);
    expect(a.timeline?.elapsed).toBeCloseTo(1461 / 2922, 6); // 4 years of 8
    expect(a.timeline?.daysRemaining).toBe(1461);
    const done = assuranceVieAnalysis({ metadata: MD, value: 1, today: "2028-01-11" });
    expect(done.timeline).toMatchObject({ reached: true, elapsed: 1, daysSince: 10, daysRemaining: null });
  });

  it("is null without premiums or an opening date, never NaN", () => {
    const a = assuranceVieAnalysis({ metadata: EMPTY_ASSURANCE_VIE_METADATA, value: 5, today: "2024-01-01" });
    expect(a).toMatchObject({ premiumsPaid: null, difference: null, differencePct: null, timeline: null, scheduledAnnual: null, holdings: [] });
  });
});
