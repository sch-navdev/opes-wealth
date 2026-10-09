import { describe, expect, it } from "vitest";
import { computeRetirement } from "@/lib/retirement";
import {
  DEMO_RETIREMENT_TARGET_SHARE,
  demoRetirementPreset,
  isDemoPresetOnTrack,
} from "@/lib/retirement-demo";

const run = (portfolio: number) => {
  const p = demoRetirementPreset(portfolio)!;
  const result = computeRetirement({
    currentAge: Number(p.age),
    retirementAge: Number(p.retAge),
    desiredMonthlyIncome: Number(p.income),
    annualReturn: Number(p.ret) / 100,
    inflation: Number(p.inflation) / 100,
    method: "swr",
    withdrawalRate: Number(p.swr) / 100,
    startingAssets: portfolio,
  });
  if (!result.ok) throw new Error("expected a result");
  return result;
};

describe("demoRetirementPreset", () => {
  it("is on track for demo-sized portfolios in any currency scale, with real headroom", () => {
    for (const portfolio of [150_000, 420_000, 1_250_000, 4_600_000, 90_000_000]) {
      const r = run(portfolio);
      expect(r.onTrack).toBe(true);
      expect(r.requiredMonthly).toBe(0);
      expect(r.surplus).toBeGreaterThan(0);
      // the target stays at or below the intended share of the grown assets (income is rounded down)
      expect(r.targetCapital).toBeLessThanOrEqual(r.assetsGrown * DEMO_RETIREMENT_TARGET_SHARE + 1e-6);
      expect(r.targetCapital).toBeGreaterThan(r.assetsGrown * 0.5);
      expect(isDemoPresetOnTrack(portfolio)).toBe(true);
    }
  });

  it("worked example with invented numbers: 1,000,000 over 18 years at 5 %", () => {
    const p = demoRetirementPreset(1_000_000)!;
    expect(p).toEqual({ age: "42", retAge: "60", income: "3500", ret: "5", inflation: "2", swr: "4" });
    const r = run(1_000_000);
    expect(r.assetsGrown).toBeCloseTo(1_000_000 * Math.pow(1.05, 18), 4);
    expect(r.incomeAtRetirement).toBeCloseTo(3_500 * Math.pow(1.02, 18), 4);
    expect(r.onTrack).toBe(true);
  });

  it("returns null when there is nothing to size the demo on", () => {
    expect(demoRetirementPreset(0)).toBeNull();
    expect(demoRetirementPreset(-5)).toBeNull();
    expect(demoRetirementPreset(Number.NaN)).toBeNull();
    expect(demoRetirementPreset(1_000)).toBeNull();
    expect(isDemoPresetOnTrack(0)).toBe(false);
  });
});
