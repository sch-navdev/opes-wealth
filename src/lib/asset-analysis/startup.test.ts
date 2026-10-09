import { describe, expect, it } from "vitest";
import { EMPTY_STARTUP_METADATA, type StartupMetadata } from "@/lib/startups";
import { startupAnalysis } from "./startup";
import { companyAnalysis } from "./company";
import { EMPTY_COMPANY_METADATA } from "@/lib/companies";

// Invented fixture: 1,000 shares bought at 1.00; seed at 2.00 (post 4M), series A at 5.00 (post 20M).
const MD: StartupMetadata = {
  ...EMPTY_STARTUP_METADATA,
  avg_cost_per_share: 1,
  funding_rounds: [
    { id: "r2", date: "2024-06-01", name: "Series A", price_per_share: 5, post_money_valuation: 20_000_000 },
    { id: "r1", date: "2023-01-01", name: "Seed", price_per_share: 2, post_money_valuation: 4_000_000 },
  ],
};

describe("startupAnalysis", () => {
  it("orders rounds, computes step-ups, ownership per round and the multiple on cost", () => {
    const a = startupAnalysis(MD, 1000);
    expect(a.rounds.map((r) => r.name)).toEqual(["Seed", "Series A"]);
    expect(a.rounds[0].stepUp).toBeNull();
    expect(a.rounds[1].stepUp).toBe(2.5);
    expect(a.rounds[0].ownership).toBeCloseTo((1000 * 2) / 4_000_000, 12);
    expect(a.rounds[1].ownership).toBeCloseTo((1000 * 5) / 20_000_000, 12);
    expect(a.costBasis).toBe(1000);
    expect(a.value).toBe(5000);
    expect(a.multiple).toBe(5);
    expect(a.priceMultiple).toBe(5);
    expect(a.latestPostMoney).toBe(20_000_000);
  });

  it("dilution is the relative change of ownership: 0.0005 % -> 0.000025 % is -50 %", () => {
    // seed 2000/4M = 5e-4 ; series A 5000/20M = 2.5e-4
    expect(startupAnalysis(MD, 1000).dilution).toBeCloseTo(-0.5, 10);
  });

  it("has no dilution or ownership without post-money valuations, and no rounds without data", () => {
    const noPm = { ...MD, funding_rounds: MD.funding_rounds.map((r) => ({ ...r, post_money_valuation: null })) };
    expect(startupAnalysis(noPm, 1000).dilution).toBeNull();
    expect(startupAnalysis(noPm, 1000).rounds[0].ownership).toBeNull();
    const empty = startupAnalysis(EMPTY_STARTUP_METADATA, 0);
    expect(empty.rounds).toEqual([]);
    expect(empty.multiple).toBeNull();
  });
});

describe("companyAnalysis", () => {
  const md = { ...EMPTY_COMPANY_METADATA, ownership_percentage: 40, company_value: 2_000_000, valuation_date: "2025-01-01", valuation_method: "Multiple", held_asset_ids: ["a", "b"] };

  it("computes the stake, the valuation age and the linked accounts", () => {
    const c = companyAnalysis({
      metadata: md,
      history: [{ date: "2024-01-01", value: 600_000 }, { date: "2025-01-01", value: 800_000 }],
      today: "2025-01-31",
      linkedAccounts: [{ value: 1000 }, { value: 500 }],
    });
    expect(c.ownership).toBeCloseTo(0.4, 10);
    expect(c.stakeValue).toBe(800_000);
    expect(c.valuationAgeDays).toBe(30);
    expect(c.change?.pct).toBeCloseTo(1 / 3, 10);
    expect(c.heldAssets).toBe(2);
    expect(c.linkedAccounts).toEqual({ count: 2, total: 1500 });
    expect(c.noHistory).toBe(false);
  });

  it("returns nulls when nothing is recorded", () => {
    const c = companyAnalysis({ metadata: EMPTY_COMPANY_METADATA, history: [], today: "2025-01-31" });
    expect(c).toMatchObject({ ownership: null, companyValue: null, stakeValue: null, valuationDate: null, valuationAgeDays: null, change: null, linkedAccounts: null, noHistory: true });
  });
});
