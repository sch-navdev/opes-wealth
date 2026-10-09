import { describe, expect, it } from "vitest";
import { EMPTY_SCPI_METADATA, type ScpiMetadata } from "@/lib/scpi";
import { scpiAnalysis } from "./scpi";

// Invented fixture: 100 shares bought at 200 (fee 10 %) -> invested 20,000, fees 2,000, withdrawal price 180.
const MD: ScpiMetadata = {
  ...EMPTY_SCPI_METADATA,
  subscription_price: 200,
  entry_fee_pct: 10,
  yield_history: [
    { id: "y1", year: 2023, rate: 4.5 },
    { id: "y2", year: 2024, rate: 5 },
  ],
  dividends: [
    { id: "a", date: "2023-10-15", amount: 200, status: "received", quarter: "2023-Q3" },
    { id: "b", date: "2024-01-15", amount: 250, status: "received", quarter: "2023-Q4" },
    { id: "c", date: "2024-04-15", amount: 250, status: "received", quarter: "2024-Q1" },
    { id: "d", date: "2024-07-15", amount: 250, status: "expected", quarter: "2024-Q2" },
  ],
};

describe("scpiAnalysis", () => {
  it("compares value with capital invested and withdrawal with subscription price", () => {
    const a = scpiAnalysis({ metadata: MD, shares: 100, currentValue: 18_000, history: [], today: "2024-09-01" });
    expect(a.invested).toBe(20_000);
    expect(a.entryFees).toBe(2_000);
    expect(a.value).toBe(18_000);
    expect(a.valueVsInvested).toBe(-2_000);
    expect(a.valueVsInvestedPct).toBeCloseTo(-0.1, 10);
    expect(a.withdrawalGapPct).toBeCloseTo(-0.1, 10);
    expect(a.withdrawalPrice).toBe(180);
  });

  it("sums received dividends by year (expected ones excluded) next to the stated rate", () => {
    const a = scpiAnalysis({ metadata: MD, shares: 100, currentValue: 18_000, history: [], today: "2024-09-01" });
    expect(a.years).toEqual([
      { year: 2023, received: 200, realisedRate: 0.01, statedRate: 0.045, partial: true },
      { year: 2024, received: 500, realisedRate: 0.025, statedRate: 0.05, partial: true },
    ]);
    expect(a.totalReceived).toBe(700);
    expect(a.totalReturnPct).toBeCloseTo((18_000 + 700 - 20_000) / 20_000, 10);
  });

  it("derives the per-share history from the recorded values", () => {
    const a = scpiAnalysis({
      metadata: MD,
      shares: 100,
      currentValue: 18_000,
      history: [
        { date: "2023-10-01", value: 18_000 },
        { date: "2024-08-01", value: 19_000 },
      ],
      today: "2024-09-01",
    });
    expect(a.perShareHistory).toEqual([
      { date: "2023-10-01", value: 180 },
      { date: "2024-08-01", value: 190 },
    ]);
  });

  it("returns nulls for an empty SCPI, never NaN", () => {
    const a = scpiAnalysis({ metadata: EMPTY_SCPI_METADATA, shares: 0, currentValue: 0, history: [], today: "2024-09-01" });
    expect(a).toMatchObject({ invested: 0, valueVsInvested: null, valueVsInvestedPct: null, withdrawalGapPct: null, totalReturnPct: null, years: [], perShareHistory: [] });
  });
});
