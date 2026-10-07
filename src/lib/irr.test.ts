import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_START,
  periodicIrr,
  projectFinalCapital,
  savingsPlanFlows,
  solveSavingsPlan,
  summarizeFlows,
  xirr,
} from "./irr";
import type { DatedFlow, SavingsPlanInput } from "./irr-compare-types";

/** Deterministic PRNG (mulberry32) so the property tests are reproducible. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rateOf(result: ReturnType<typeof xirr>): number {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.rate;
}

describe("xirr", () => {
  it("one year, 10 %", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 1100 },
    ]);
    expect(r.ok).toBe(true);
    expect(rateOf(r)).toBeCloseTo(0.1, 9);
    expect(r.ok && r.multipleRoots).toBe(false);
  });

  it("matches Excel's documented XIRR example", () => {
    // Excel help: -10000 on 1-Jan-2008, +2750 2008-03-01, +4250 2008-10-30, +3250 2009-02-15, +2750 2009-04-01 -> 0.373362535
    const r = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ]);
    expect(rateOf(r)).toBeCloseTo(0.373362535, 6);
  });

  it("is independent of the input order and nets same-day flows", () => {
    const a: DatedFlow[] = [
      { date: "2026-01-01", amount: 1100 },
      { date: "2025-01-01", amount: -600 },
      { date: "2025-01-01", amount: -400 },
    ];
    expect(rateOf(xirr(a))).toBeCloseTo(0.1, 9);
  });

  it("handles negative rates", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2026-01-01", amount: 800 },
    ]);
    expect(rateOf(r)).toBeCloseTo(-0.2, 9);
  });

  it("handles a near-total loss and a huge gain", () => {
    expect(
      rateOf(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: 20 }])),
    ).toBeCloseTo(-0.98, 8);
    // x50 in half a year is far above 100x annualised... (50^2 - 1) = 2499 = +249,900 %: outside the range, no solution
    const huge = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2025-07-02", amount: 50000 },
    ]);
    expect(huge.ok).toBe(false);
    // +20 % in a month is about +750 % a year: inside the range
    const fast = xirr([
      { date: "2025-01-01", amount: -1000 },
      { date: "2025-02-01", amount: 1200 },
    ]);
    expect(fast.ok).toBe(true);
    expect(rateOf(fast)).toBeCloseTo(Math.pow(1.2, 365 / 31) - 1, 6);
  });

  it("returns typed failures instead of NaN", () => {
    expect(xirr([])).toEqual({ ok: false, reason: "not_enough_flows" });
    expect(xirr([{ date: "2025-01-01", amount: -1 }])).toEqual({ ok: false, reason: "not_enough_flows" });
    expect(
      xirr([
        { date: "2025-01-01", amount: -1 },
        { date: "2026-01-01", amount: -2 },
      ]),
    ).toEqual({ ok: false, reason: "no_sign_change" });
    expect(
      xirr([
        { date: "2025-01-01", amount: 1 },
        { date: "2026-01-01", amount: 2 },
      ]),
    ).toEqual({ ok: false, reason: "no_sign_change" });
    // zero duration
    expect(
      xirr([
        { date: "2025-01-01", amount: -100 },
        { date: "2025-01-01", amount: 150 },
      ]),
    ).toEqual({ ok: false, reason: "not_enough_flows" });
    // zero amounts are ignored
    expect(
      xirr([
        { date: "2025-01-01", amount: 0 },
        { date: "2026-01-01", amount: 5 },
      ]),
    ).toEqual({ ok: false, reason: "not_enough_flows" });
    expect(xirr([{ date: "nope", amount: -1 }, { date: "2026-01-01", amount: 2 }])).toEqual({
      ok: false,
      reason: "no_solution",
    });
    expect(xirr([{ date: "2025-01-01", amount: Number.NaN }, { date: "2026-01-01", amount: 2 }])).toEqual({
      ok: false,
      reason: "no_solution",
    });
  });

  it("flags multiple roots (-1000, +2500, -1550 has two roots, about 13.8 % and 36.2 %)", () => {
    // With y = 1/(1+r): 1550 y^2 - 2500 y + 1000 = 0 -> y = 0.8785 or 0.7343.
    const flows: DatedFlow[] = [
      { date: "2020-01-01", amount: -1000 },
      { date: "2021-01-01", amount: 2500 },
      { date: "2022-01-01", amount: -1550 },
    ];
    const r = xirr(flows);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.multipleRoots).toBe(true);
      // it is a genuine root
      const t1 = 366 / 365;
      const t2 = 731 / 365;
      const npv = -1000 + 2500 / Math.pow(1 + r.rate, t1) - 1550 / Math.pow(1 + r.rate, t2);
      expect(Math.abs(npv)).toBeLessThan(1e-6);
    }
  });

  it("does not flag multiple roots for a single-sign-change stream (even with many flows)", () => {
    const flows: DatedFlow[] = [
      { date: "2020-01-01", amount: -1000 },
      { date: "2021-01-01", amount: 100 },
      { date: "2022-01-01", amount: 100 },
      { date: "2023-01-01", amount: 1100 },
    ];
    const r = xirr(flows);
    expect(r.ok && r.multipleRoots).toBe(false);
    expect(rateOf(r)).toBeCloseTo(0.1, 3);
  });

  it("long horizon does not overflow", () => {
    const r = xirr([
      { date: "1900-01-01", amount: -100 },
      { date: "2100-01-01", amount: 100000 },
    ]);
    expect(r.ok).toBe(true);
    expect(rateOf(r)).toBeCloseTo(Math.pow(1000, 365 / 73049) - 1, 4);
  });
});

describe("periodicIrr", () => {
  it("annualises a monthly IRR as an effective rate", () => {
    // -100 then +101 one month later: monthly 1 % -> (1.01)^12 - 1
    const r = periodicIrr([-100, 101], 12);
    expect(rateOf(r)).toBeCloseTo(Math.pow(1.01, 12) - 1, 9);
  });

  it("annual periods equal the plain IRR", () => {
    expect(rateOf(periodicIrr([-100, 0, 121], 1))).toBeCloseTo(0.1, 9);
  });

  it("typed failures", () => {
    expect(periodicIrr([-100], 12)).toEqual({ ok: false, reason: "not_enough_flows" });
    expect(periodicIrr([-100, -5], 12)).toEqual({ ok: false, reason: "no_sign_change" });
    expect(periodicIrr([-100, 105], 0)).toEqual({ ok: false, reason: "no_solution" });
    expect(periodicIrr([-100, Number.NaN], 12)).toEqual({ ok: false, reason: "no_solution" });
  });
});

describe("summarizeFlows", () => {
  it("money in/out, gain, multiple and years", () => {
    const s = summarizeFlows([
      { date: "2020-01-01", amount: -1000 },
      { date: "2021-01-01", amount: -500 },
      { date: "2022-01-01", amount: 100 },
      { date: "2025-01-01", amount: 2000 },
    ]);
    expect(s.moneyIn).toBe(1500);
    expect(s.moneyOut).toBe(2100);
    expect(s.gain).toBe(600);
    expect(s.multiple).toBeCloseTo(1.4, 12);
    expect(s.years).toBeCloseTo((1827 + 0) / 365, 6); // 2020-01-01 -> 2025-01-01 = 1827 days
  });

  it("empty and inflow-only streams", () => {
    expect(summarizeFlows([])).toEqual({ moneyIn: 0, moneyOut: 0, gain: 0, multiple: null, years: 0 });
    expect(summarizeFlows([{ date: "2025-01-01", amount: 10 }]).multiple).toBeNull();
  });
});

describe("savings plan: the advisor screenshot", () => {
  const screenshot: SavingsPlanInput = {
    initialCapital: 30000,
    monthlySaving: 300,
    finalCapital: 150000,
    years: 20,
  };

  it("solves the exact rate for exactly 150,000: 2.8921 % effective (monthly 0.23787 %, nominal 2.8545 %)", () => {
    const r = solveSavingsPlan(screenshot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.effectiveAnnualRate * 100).toBeCloseTo(2.8921, 4);
    const monthly = Math.pow(1 + r.effectiveAnnualRate, 1 / 12) - 1;
    expect(monthly * 100).toBeCloseTo(0.23787, 5);
    expect(r.nominalAnnualRate * 100).toBeCloseTo(2.8545, 4);
    expect(r.totalDeposits).toBe(102000);
    expect(r.finalCapital).toBeCloseTo(150000, 6);
    expect(r.totalInterest).toBeCloseTo(48000, 6);
  });

  it("at the displayed 2.89 % the final is 149,956 and the interest 47,956", () => {
    const final = projectFinalCapital({ initial: 30000, monthly: 300, years: 20, effectiveAnnualRate: 0.0289 });
    expect(Math.round(final)).toBe(149956);
    expect(Math.round(final - 102000)).toBe(47956);
  });

  it("agrees with xirr over the dated flows (tolerance documented: day counts differ from 12 equal months)", () => {
    // The plan assumes 12 equal months a year; XIRR uses actual/365 on real month lengths and leap days
    // (7305 days over 20 years = 20.014 'years'), so the two rates differ by a few thousandths of a point.
    const solved = solveSavingsPlan(screenshot);
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    const flows = savingsPlanFlows(screenshot);
    const x = xirr(flows);
    expect(rateOf(x)).toBeCloseTo(solved.effectiveAnnualRate, 3);
    expect(Math.abs(rateOf(x) - solved.effectiveAnnualRate)).toBeLessThan(0.0005);
  });
});

describe("solveSavingsPlan edge cases", () => {
  it("monthly = 0 is plain compounding", () => {
    const r = solveSavingsPlan({ initialCapital: 1000, monthlySaving: 0, finalCapital: 1000 * 1.05 ** 10, years: 10 });
    expect(r.ok && r.effectiveAnnualRate).toBeCloseTo(0.05, 10);
    expect(r.ok && r.totalDeposits).toBe(1000);
  });

  it("initial = 0 is a pure annuity", () => {
    const r = solveSavingsPlan({ initialCapital: 0, monthlySaving: 200, finalCapital: 60000, years: 20 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = projectFinalCapital({ initial: 0, monthly: 200, years: 20, effectiveAnnualRate: r.effectiveAnnualRate });
    expect(back).toBeCloseTo(60000, 4);
    expect(r.effectiveAnnualRate).toBeGreaterThan(0);
  });

  it("final = total deposits is 0 %", () => {
    const r = solveSavingsPlan({ initialCapital: 10000, monthlySaving: 100, finalCapital: 10000 + 100 * 120, years: 10 });
    expect(r.ok && r.effectiveAnnualRate).toBe(0);
    expect(r.ok && r.nominalAnnualRate).toBe(0);
    expect(r.ok && r.totalInterest).toBeCloseTo(0, 9);
  });

  it("final below the deposits gives a negative rate", () => {
    const r = solveSavingsPlan({ initialCapital: 10000, monthlySaving: 100, finalCapital: 15000, years: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.effectiveAnnualRate).toBeLessThan(0);
    expect(r.nominalAnnualRate).toBeLessThan(0);
    expect(r.totalInterest).toBeLessThan(0);
    expect(projectFinalCapital({ initial: 10000, monthly: 100, years: 10, effectiveAnnualRate: r.effectiveAnnualRate })).toBeCloseTo(15000, 4);
  });

  it("non-whole years of months (6 months) work", () => {
    const r = solveSavingsPlan({ initialCapital: 0, monthlySaving: 100, finalCapital: 620, years: 0.5 });
    expect(r.ok).toBe(true);
  });

  it("invalid inputs", () => {
    const base: SavingsPlanInput = { initialCapital: 1000, monthlySaving: 100, finalCapital: 5000, years: 5 };
    const bad: Partial<SavingsPlanInput>[] = [
      { initialCapital: -1 },
      { monthlySaving: -1 },
      { finalCapital: 0 },
      { finalCapital: -5 },
      { years: 0 },
      { years: -2 },
      { years: Number.NaN },
      { years: 0.01 },
      { years: 5.01 },
      { initialCapital: Number.POSITIVE_INFINITY },
      { monthlySaving: Number.NaN },
      { initialCapital: 0, monthlySaving: 0 },
    ];
    for (const patch of bad) {
      expect(solveSavingsPlan({ ...base, ...patch })).toEqual({ ok: false, reason: "invalid_input" });
    }
  });

  it("unreachable targets are no_solution, not NaN", () => {
    const r = solveSavingsPlan({ initialCapital: 1000, monthlySaving: 0, finalCapital: 1e300, years: 1 });
    expect(r).toEqual({ ok: false, reason: "no_solution" });
  });

  it("property: projectFinalCapital(solve(...)) round-trips to the target within a cent", () => {
    const rand = rng(20261007);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      const initialCapital = rand() < 0.2 ? 0 : Math.round(rand() * 200000);
      const monthlySaving = rand() < 0.2 ? 0 : Math.round(rand() * 5000);
      if (initialCapital + monthlySaving <= 0) continue;
      const years = 1 + Math.floor(rand() * 40);
      const deposits = initialCapital + monthlySaving * years * 12;
      // targets from 0.6x to 4x of the deposits (negative to strongly positive rates)
      const finalCapital = Math.round(deposits * (0.6 + rand() * 3.4) * 100) / 100;
      if (!(finalCapital > 0)) continue;
      const r = solveSavingsPlan({ initialCapital, monthlySaving, finalCapital, years });
      expect(r.ok, JSON.stringify({ initialCapital, monthlySaving, finalCapital, years })).toBe(true);
      if (!r.ok) continue;
      const back = projectFinalCapital({ initial: initialCapital, monthly: monthlySaving, years, effectiveAnnualRate: r.effectiveAnnualRate });
      expect(Math.abs(back - finalCapital)).toBeLessThan(0.01);
      expect(Math.abs(r.finalCapital - finalCapital)).toBeLessThan(0.01);
      expect(r.totalInterest).toBeCloseTo(finalCapital - deposits, 2);
      // the sign of the rate follows the sign of the interest
      expect(Math.sign(r.effectiveAnnualRate)).toBe(Math.sign(Math.round((finalCapital - deposits) * 1e6)));
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe("projectFinalCapital", () => {
  it("0 % returns the deposits; NaN on invalid input", () => {
    expect(projectFinalCapital({ initial: 100, monthly: 10, years: 1, effectiveAnnualRate: 0 })).toBeCloseTo(220, 9);
    expect(projectFinalCapital({ initial: 100, monthly: 10, years: 0, effectiveAnnualRate: 0.05 })).toBeNaN();
    expect(projectFinalCapital({ initial: 100, monthly: 10, years: 1, effectiveAnnualRate: -1 })).toBeNaN();
  });
});

describe("savingsPlanFlows", () => {
  const plan: SavingsPlanInput = { initialCapital: 1000, monthlySaving: 100, finalCapital: 2500, years: 1 };

  it("initial at t0, a deposit at each month end, the final capital last", () => {
    const flows = savingsPlanFlows(plan, "2026-01-31");
    expect(flows).toHaveLength(1 + 12 + 1);
    expect(flows[0]).toEqual({ date: "2026-01-31", amount: -1000 });
    expect(flows[1]).toEqual({ date: "2026-02-28", amount: -100 }); // clamped to the month length
    expect(flows[2]).toEqual({ date: "2026-03-31", amount: -100 });
    expect(flows[12]).toEqual({ date: "2027-01-31", amount: -100 });
    expect(flows[13]).toEqual({ date: "2027-01-31", amount: 2500 });
    expect(flows.filter((f) => f.amount < 0)).toHaveLength(13);
    expect(flows.filter((f) => f.amount > 0)).toHaveLength(1);
  });

  it("is deterministic with the default start", () => {
    const a = savingsPlanFlows(plan);
    expect(a[0].date).toBe(DEFAULT_PLAN_START);
    expect(savingsPlanFlows(plan)).toEqual(a);
  });

  it("omits a zero initial capital / zero deposits; invalid plans give []", () => {
    expect(savingsPlanFlows({ ...plan, initialCapital: 0 })[0].amount).toBe(-100);
    expect(savingsPlanFlows({ ...plan, monthlySaving: 0 })).toHaveLength(2);
    expect(savingsPlanFlows({ ...plan, years: 0 })).toEqual([]);
    expect(savingsPlanFlows(plan, "garbage")).toEqual([]);
    expect(savingsPlanFlows({ ...plan, finalCapital: -1 })).toEqual([]);
  });

  it("summary of the screenshot plan: 102,000 in, 150,000 out", () => {
    const flows = savingsPlanFlows({ initialCapital: 30000, monthlySaving: 300, finalCapital: 150000, years: 20 });
    const s = summarizeFlows(flows);
    expect(s.moneyIn).toBe(102000);
    expect(s.moneyOut).toBe(150000);
    expect(s.gain).toBe(48000);
    expect(s.years).toBeCloseTo(20.014, 2);
  });
});
