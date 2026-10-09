import { describe, expect, it } from "vitest";
import { genericAnalysis } from "./generic";

describe("genericAnalysis", () => {
  it("summarises a value history", () => {
    const g = genericAnalysis([
      { date: "2025-01-01", value: 100 },
      { date: "2025-02-01", value: 80 },
      { date: "2025-03-01", value: 120 },
    ]);
    expect(g.change?.amount).toBe(20);
    expect(g.drawdown?.pct).toBeCloseTo(-0.2, 10);
    expect(g.high?.value).toBe(120);
    expect(g.low?.value).toBe(80);
    expect(g.observations).toBe(3);
  });
  it("is all null for an empty history", () => {
    expect(genericAnalysis([])).toEqual({ change: null, drawdown: null, volatility: null, high: null, low: null, observations: 0 });
  });
});
