import { describe, expect, it } from "vitest";
import { projectFinalCapital } from "@/lib/irr";
import {
  computeRetirement,
  monthlySavingForGap,
  parseNumberInput,
  projectionBreakdown,
  sensitivity,
  type RetirementInput,
  type RetirementOk,
} from "@/lib/retirement";

const base: RetirementInput = {
  currentAge: 40,
  retirementAge: 60,
  desiredMonthlyIncome: 3000,
  annualReturn: 0.05,
  inflation: 0,
  method: "swr",
  withdrawalRate: 0.04,
  startingAssets: 200_000,
};

function ok(input: RetirementInput): RetirementOk {
  const res = computeRetirement(input);
  if (!res.ok) throw new Error(`expected ok, got ${res.reason}`);
  return res;
}

describe("worked examples (age 40 to 60, 3,000/month, 5 %, 200,000 today)", () => {
  it("(a) inflation 0, 4 % rule", () => {
    const r = ok(base);
    expect(r.years).toBe(20);
    expect(r.months).toBe(240);
    expect(r.targetCapital).toBeCloseTo(900_000, 4);
    expect(r.assetsGrown).toBeCloseTo(530_659.5, 0);
    expect(Math.round(r.gap)).toBe(369_340);
    expect(Math.round(r.requiredMonthly)).toBe(910);
    expect(r.onTrack).toBe(false);
  });

  it("(b) inflation 0, returns only", () => {
    const r = ok({ ...base, method: "returns" });
    expect(r.targetCapital).toBeCloseTo(720_000, 4);
    expect(Math.round(r.gap)).toBe(189_340);
    expect(Math.round(r.requiredMonthly)).toBe(467);
  });

  it("(c) inflation 2 %, 4 % rule", () => {
    const r = ok({ ...base, inflation: 0.02 });
    expect(Math.round(r.incomeAtRetirement)).toBe(4458);
    expect(Math.round(r.targetCapital)).toBe(1_337_353);
    expect(Math.round(r.requiredMonthly)).toBe(1988);
  });
});

describe("round trip with projectFinalCapital (end-of-month deposits)", () => {
  it.each([
    ["4 % rule", base],
    ["returns only", { ...base, method: "returns" as const }],
    ["inflation", { ...base, inflation: 0.02 }],
    ["no starting assets", { ...base, startingAssets: 0 }],
    ["short horizon", { ...base, retirementAge: 43, startingAssets: 1000 }],
    ["fractional ages", { ...base, currentAge: 40.5, retirementAge: 62.25 }],
  ])("feeding the saving back reaches the target within a cent (%s)", (_name, input) => {
    const r = ok(input);
    const final = projectFinalCapital({
      initial: input.startingAssets,
      monthly: r.requiredMonthly,
      years: r.years,
      effectiveAnnualRate: input.annualReturn,
    });
    expect(Math.abs(final - r.targetCapital)).toBeLessThan(0.01);
  });

  it("round trips at r = 0 too", () => {
    const input = { ...base, annualReturn: 0 };
    const r = ok(input);
    expect(r.requiredMonthly).toBeCloseTo((r.targetCapital - 200_000) / 240, 6);
    const final = projectFinalCapital({ initial: 200_000, monthly: r.requiredMonthly, years: 20, effectiveAnnualRate: 0 });
    expect(Math.abs(final - r.targetCapital)).toBeLessThan(0.01);
  });
});

describe("edge cases", () => {
  it("is on track when the assets already outgrow the target", () => {
    const r = ok({ ...base, startingAssets: 1_000_000 });
    expect(r.onTrack).toBe(true);
    expect(r.gap).toBe(0);
    expect(r.requiredMonthly).toBe(0);
    expect(r.surplus).toBeCloseTo(1_000_000 * Math.pow(1.05, 20) - 900_000, 2);
  });

  it("validates the ages", () => {
    expect(computeRetirement({ ...base, retirementAge: 40 })).toEqual({ ok: false, reason: "age_order" });
    expect(computeRetirement({ ...base, retirementAge: 35 })).toEqual({ ok: false, reason: "age_order" });
    expect(computeRetirement({ ...base, retirementAge: 40.02 })).toEqual({ ok: false, reason: "age_order" });
  });

  it("handles a negative return in the library (the UI blocks it)", () => {
    const r = ok({ ...base, annualReturn: -0.02 });
    expect(r.requiredMonthly).toBeGreaterThan(0);
    expect(r.assetsGrown).toBeLessThan(200_000);
    const final = projectFinalCapital({ initial: 200_000, monthly: r.requiredMonthly, years: 20, effectiveAnnualRate: -0.02 });
    expect(Math.abs(final - r.targetCapital)).toBeLessThan(0.01);
  });

  it("guards the returns-only method at a return of 0 or below", () => {
    expect(computeRetirement({ ...base, method: "returns", annualReturn: 0 })).toEqual({ ok: false, reason: "return_not_positive" });
    expect(computeRetirement({ ...base, method: "returns", annualReturn: -0.01 })).toEqual({ ok: false, reason: "return_not_positive" });
  });

  it("rejects NaN, infinite, huge and out-of-range inputs", () => {
    for (const patch of [
      { currentAge: Number.NaN },
      { desiredMonthlyIncome: Number.POSITIVE_INFINITY },
      { desiredMonthlyIncome: 0 },
      { desiredMonthlyIncome: -5 },
      { startingAssets: -1 },
      { withdrawalRate: 0 },
      { annualReturn: -1 },
      { desiredMonthlyIncome: 1e300 },
      { desiredMonthlyIncome: 1e14, withdrawalRate: 0.0001 },
    ] satisfies Partial<RetirementInput>[]) {
      expect(computeRetirement({ ...base, ...patch })).toMatchObject({ ok: false, reason: "invalid_input" });
    }
  });

  it("works with no starting assets", () => {
    const r = ok({ ...base, startingAssets: 0 });
    expect(r.assetsGrown).toBe(0);
    expect(r.gap).toBeCloseTo(900_000, 4);
    expect(r.assetGrowth).toBe(0);
  });

  it("splits the final capital into assets, deposits and growth that add up to the target", () => {
    const r = ok(base);
    const parts = projectionBreakdown(base.startingAssets, r);
    expect(parts.map((p) => p.id)).toEqual(["assets", "assetGrowth", "contributions", "contributionGrowth"]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(r.targetCapital, 4);
    expect(parts.every((p) => p.amount >= 0)).toBe(true);
  });

  it("monthlySavingForGap returns 0 for no gap", () => {
    expect(monthlySavingForGap(0, 0.05, 240)).toBe(0);
    expect(monthlySavingForGap(-10, 0.05, 240)).toBe(0);
  });
});

describe("sensitivity", () => {
  const rows = sensitivity({ ...base, inflation: 0.02 });
  const returns = rows.filter((r) => r.kind === "return");
  const inflation = rows.filter((r) => r.kind === "inflation");

  it("lists the return at -1 pt, base, +1 pt and the inflation at 0, 2 and 3 %", () => {
    expect(returns.map((r) => r.value)).toEqual([0.04, 0.05, 0.06]);
    expect(returns.map((r) => r.base)).toEqual([false, true, false]);
    expect(inflation.map((r) => r.value)).toEqual([0, 0.02, 0.03]);
    expect(inflation.map((r) => r.base)).toEqual([false, true, false]);
  });

  it("is monotonic: a higher return needs less saving, higher inflation needs more", () => {
    const r = returns.map((x) => x.requiredMonthly as number);
    expect(r[0]).toBeGreaterThan(r[1]);
    expect(r[1]).toBeGreaterThan(r[2]);
    const i = inflation.map((x) => x.requiredMonthly as number);
    expect(i[0]).toBeLessThan(i[1]);
    expect(i[1]).toBeLessThan(i[2]);
  });

  it("the base rows equal the headline figure", () => {
    const head = ok({ ...base, inflation: 0.02 }).requiredMonthly;
    expect(returns[1].requiredMonthly).toBeCloseTo(head, 8);
    expect(inflation[1].requiredMonthly).toBeCloseTo(head, 8);
  });

  it("gives null where a case cannot be computed (returns-only at 0 %)", () => {
    const r = sensitivity({ ...base, method: "returns", annualReturn: 0.01 });
    expect(r.find((x) => x.kind === "return" && x.value === 0)?.requiredMonthly).toBeNull();
  });
});

describe("parseNumberInput", () => {
  it("accepts dots, commas and spaces and rejects blanks", () => {
    expect(parseNumberInput("4.5")).toBe(4.5);
    expect(parseNumberInput("4,5")).toBe(4.5);
    expect(parseNumberInput(" 3 000 ")).toBe(3000);
    expect(parseNumberInput("")).toBeNaN();
    expect(parseNumberInput("abc")).toBeNaN();
  });
});

describe("on-track boundary and the on-track result shape", () => {
  const needed = 900_000 / Math.pow(1.05, 20); // assets whose growth exactly meets the 900,000 target

  it("flips to on track as soon as the grown assets reach the target", () => {
    const below = ok({ ...base, startingAssets: needed - 1 });
    expect(below.onTrack).toBe(false);
    expect(below.requiredMonthly).toBeGreaterThan(0);
    expect(below.surplus).toBe(0);
    const above = ok({ ...base, startingAssets: needed + 1 });
    expect(above.onTrack).toBe(true);
    expect(above.requiredMonthly).toBe(0);
    expect(above.gap).toBe(0);
    expect(above.surplus).toBeGreaterThan(0);
  });

  it("an on-track result carries no deposits and a consistent breakdown", () => {
    const r = ok({ ...base, startingAssets: 1_000_000 });
    expect(r.totalContributions).toBe(0);
    expect(r.contributionGrowth).toBeCloseTo(0, 6);
    const parts = projectionBreakdown(1_000_000, r);
    expect(parts.find((p) => p.id === "contributions")!.amount).toBe(0);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(r.assetsGrown, 4);
  });

  it("is on track with the returns-only method when the capital already earns the income", () => {
    const r = ok({ ...base, method: "returns", startingAssets: 600_000 }); // target = 36,000 / 0.05 = 720,000
    expect(r.onTrack).toBe(true);
    expect(r.surplus).toBeCloseTo(600_000 * Math.pow(1.05, 20) - 720_000, 2);
  });
});
