import { describe, expect, it } from "vitest";
import {
  aggregateAttribution,
  attributionFromLots,
  computeAttribution,
  roundMoney,
} from "./portfolio-attribution";

const EPS = 1e-9;

describe("computeAttribution", () => {
  it("splits a EUR holding in USD base (hand computed)", () => {
    // C=1000 EUR at 1.00, V=1200 EUR now at 1.10
    const r = computeAttribution({ costLocal: 1000, valueLocal: 1200, fxAtCost: 1, fxNow: 1.1 })!;
    expect(r.costBase).toBeCloseTo(1000, 9);
    expect(r.valueBase).toBeCloseTo(1320, 9);
    expect(r.totalBase).toBeCloseTo(320, 9);
    expect(r.capitalBase).toBeCloseTo(200, 9);
    expect(r.currencyBase).toBeCloseTo(120, 9);
    expect(r.capitalBase + r.currencyBase).toBeCloseTo(r.totalBase, 9);
    expect(r.capitalPct).toBeCloseTo(0.2, 9);
    expect(r.currencyPct).toBeCloseTo(0.1, 9);
    expect(r.totalPct).toBeCloseTo(0.32, 9);
    expect(r.capitalContributionPct! + r.currencyContributionPct!).toBeCloseTo(r.totalPct!, 12);
  });

  it("reverse base: same EUR holding in AED", () => {
    const fC = 4.0;
    const fN = 4.4;
    const r = computeAttribution({ costLocal: 1000, valueLocal: 1200, fxAtCost: fC, fxNow: fN })!;
    expect(r.costBase).toBeCloseTo(4000, 9);
    expect(r.valueBase).toBeCloseTo(5280, 9);
    expect(r.capitalBase).toBeCloseTo(800, 9);
    expect(r.currencyBase).toBeCloseTo(480, 9);
    expect(r.totalPct).toBeCloseTo(0.32, 9);
  });

  it("same currency has zero currency return", () => {
    const r = computeAttribution({
      costLocal: 100,
      valueLocal: 130,
      fxAtCost: 5,
      fxNow: 9,
      sameCurrency: true,
    })!;
    expect(r.sameCurrency).toBe(true);
    expect(r.currencyBase).toBe(0);
    expect(r.currencyPct).toBe(0);
    expect(r.capitalBase).toBeCloseTo(30, 9);
    expect(r.totalBase).toBeCloseTo(30, 9);
  });

  it("base strengthens: positive capital, negative currency", () => {
    const r = computeAttribution({ costLocal: 1000, valueLocal: 1100, fxAtCost: 1.2, fxNow: 1.08 })!;
    expect(r.capitalPct).toBeCloseTo(0.1, 9);
    expect(r.currencyPct!).toBeCloseTo(-0.1, 9);
    expect(r.currencyBase).toBeLessThan(0);
    expect(r.capitalBase).toBeGreaterThan(0);
    expect(r.totalPct).toBeCloseTo(1.1 * 0.9 - 1, 9);
    expect(Math.abs(r.capitalBase + r.currencyBase - r.totalBase)).toBeLessThan(EPS);
  });

  it("both negative", () => {
    const r = computeAttribution({ costLocal: 1000, valueLocal: 800, fxAtCost: 1, fxNow: 0.9 })!;
    expect(r.capitalBase).toBeCloseTo(-200, 9);
    expect(r.currencyBase).toBeCloseTo(-80, 9);
    expect(r.totalBase).toBeCloseTo(-280, 9);
    expect(r.totalPct).toBeCloseTo(-0.28, 9);
  });

  it("cost 0 gives amounts but null percentages, never NaN", () => {
    const r = computeAttribution({ costLocal: 0, valueLocal: 50, fxAtCost: 1, fxNow: 1.1 })!;
    expect(r.capitalPct).toBeNull();
    expect(r.currencyPct).toBeNull();
    expect(r.totalPct).toBeNull();
    expect(r.totalBase).toBeCloseTo(55, 9);
    expect(Math.abs(r.capitalBase + r.currencyBase - r.totalBase)).toBeLessThan(EPS);
  });

  it("invalid fx returns null", () => {
    expect(computeAttribution({ costLocal: 10, valueLocal: 10, fxAtCost: 0, fxNow: 1 })).toBeNull();
    expect(computeAttribution({ costLocal: 10, valueLocal: 10, fxAtCost: 1, fxNow: NaN })).toBeNull();
    expect(computeAttribution({ costLocal: NaN, valueLocal: 10, fxAtCost: 1, fxNow: 1 })).toBeNull();
  });

  it("negative value (liability) stays additive", () => {
    const r = computeAttribution({ costLocal: 1000, valueLocal: -200, fxAtCost: 1, fxNow: 1.1 })!;
    expect(Math.abs(r.capitalBase + r.currencyBase - r.totalBase)).toBeLessThan(EPS);
    expect(r.capitalPct).toBeCloseTo(-1.2, 9);
  });

  it("income only included on request", () => {
    const base = { costLocal: 100, valueLocal: 100, fxAtCost: 1, fxNow: 1, incomeLocal: 10 };
    expect(computeAttribution(base)!.totalBase).toBeCloseTo(0, 9);
    expect(computeAttribution({ ...base, includeIncome: true })!.totalBase).toBeCloseTo(10, 9);
  });

  it("additivity holds across random inputs", () => {
    for (let i = 0; i < 200; i++) {
      const r = computeAttribution({
        costLocal: 1 + ((i * 37) % 1000),
        valueLocal: (i * 53) % 1500,
        fxAtCost: 0.2 + ((i * 7) % 50) / 10,
        fxNow: 0.2 + ((i * 11) % 50) / 10,
      })!;
      expect(Math.abs(r.capitalBase + r.currencyBase - r.totalBase)).toBeLessThan(1e-9);
    }
  });
});

describe("attributionFromLots", () => {
  it("two lots at different fx, value allocated by quantity", () => {
    // lot1: 10 units cost 100 at 1.0; lot2: 10 units cost 200 at 1.2; V=360 now fN=1.5
    const r = attributionFromLots(
      [
        { costLocal: 100, quantity: 10, fxAtCost: 1.0 },
        { costLocal: 200, quantity: 10, fxAtCost: 1.2 },
      ],
      360,
      1.5,
    )!;
    // v1=v2=180
    expect(r.costBase).toBeCloseTo(100 + 240, 9);
    expect(r.capitalBase).toBeCloseTo(80 * 1.0 + -20 * 1.2, 9);
    expect(r.currencyBase).toBeCloseTo(180 * 0.5 + 180 * 0.3, 9);
    expect(r.valueBase).toBeCloseTo(540, 9);
    expect(Math.abs(r.capitalBase + r.currencyBase - r.totalBase)).toBeLessThan(EPS);
    expect(r.fxAtCost).toBeCloseTo(340 / 300, 12);
    expect((1 + r.capitalPct!) * (1 + r.currencyPct!) - 1).toBeCloseTo(r.totalPct!, 12);
    expect(r.capitalContributionPct! + r.currencyContributionPct!).toBeCloseTo(r.totalPct!, 12);
  });

  it("falls back to cost-weighted allocation without quantities", () => {
    const r = attributionFromLots(
      [
        { costLocal: 100, fxAtCost: 1 },
        { costLocal: 300, fxAtCost: 2 },
      ],
      800,
      2,
    )!;
    // v1=200, v2=600
    expect(r.capitalBase).toBeCloseTo(100 * 1 + 300 * 2, 9);
    expect(r.currencyBase).toBeCloseTo(200 * 1 + 0, 9);
  });

  it("single lot equals computeAttribution", () => {
    const a = attributionFromLots([{ costLocal: 1000, quantity: 5, fxAtCost: 1 }], 1200, 1.1)!;
    const b = computeAttribution({ costLocal: 1000, valueLocal: 1200, fxAtCost: 1, fxNow: 1.1 })!;
    expect(a.capitalBase).toBeCloseTo(b.capitalBase, 9);
    expect(a.currencyBase).toBeCloseTo(b.currencyBase, 9);
  });

  it("returns null for empty/invalid lots", () => {
    expect(attributionFromLots([], 10, 1)).toBeNull();
    expect(attributionFromLots([{ costLocal: 1, fxAtCost: 0 }], 10, 1)).toBeNull();
  });
});

describe("aggregateAttribution", () => {
  it("sums, skips nulls, reports coverage", () => {
    const a = computeAttribution({ costLocal: 1000, valueLocal: 1200, fxAtCost: 1, fxNow: 1.1 });
    const b = computeAttribution({ costLocal: 500, valueLocal: 450, fxAtCost: 2, fxNow: 2 });
    const agg = aggregateAttribution([a, null, b]);
    expect(agg.included).toBe(2);
    expect(agg.total).toBe(3);
    expect(agg.coverage).toBeCloseTo(2 / 3, 12);
    expect(agg.costBase).toBeCloseTo(2000, 9);
    expect(agg.capitalBase).toBeCloseTo(200 + -100, 9);
    expect(agg.currencyBase).toBeCloseTo(120, 9);
    expect(agg.totalPct).toBeCloseTo(220 / 2000, 12);
    expect(agg.capitalContributionPct! + agg.currencyContributionPct!).toBeCloseTo(agg.totalPct!, 12);
  });

  it("empty list", () => {
    const agg = aggregateAttribution([]);
    expect(agg.coverage).toBe(1);
    expect(agg.totalPct).toBeNull();
  });
});

describe("roundMoney", () => {
  it("rounds to 2dp", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-2.344)).toBe(-2.34);
  });
});
