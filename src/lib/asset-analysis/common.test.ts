import { describe, expect, it } from "vitest";
import {
  annualisedVolatility,
  cagr,
  changeOver,
  daysBetween,
  downsample,
  historyToSeries,
  maxDrawdown,
  monthsBetween,
  shareOf,
  toSeries,
} from "./common";

describe("series helpers", () => {
  it("sorts, de-duplicates by date (last wins) and drops invalid rows", () => {
    const s = toSeries([
      { date: "2025-02-01", value: 2 },
      { date: "2025-01-01", value: 1 },
      { date: "2025-02-01", value: 3 },
      { date: "nope", value: 5 },
      { date: "2025-03-01", value: Number.NaN },
    ]);
    expect(s).toEqual([
      { date: "2025-01-01", value: 1 },
      { date: "2025-02-01", value: 3 },
    ]);
    expect(historyToSeries([{ recorded_date: "2025-01-01", value: 7 }])).toEqual([{ date: "2025-01-01", value: 7 }]);
  });

  it("counts days and months between ISO days, 0 for garbage", () => {
    expect(daysBetween("2025-01-01", "2025-01-31")).toBe(30);
    expect(daysBetween("x", "2025-01-31")).toBe(0);
    expect(monthsBetween("2025-01-01", "2026-01-01")).toBeCloseTo(365 / 30.4375, 6);
  });

  it("changeOver needs two points and reports a null percentage from a non-positive start", () => {
    expect(changeOver([{ date: "2025-01-01", value: 5 }])).toBeNull();
    const c = changeOver([
      { date: "2025-01-01", value: 200 },
      { date: "2025-06-01", value: 250 },
    ]);
    expect(c?.amount).toBe(50);
    expect(c?.pct).toBeCloseTo(0.25, 10);
    expect(changeOver([{ date: "2025-01-01", value: 0 }, { date: "2025-02-01", value: 5 }])?.pct).toBeNull();
  });

  it("downsample keeps first and last", () => {
    const out = downsample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(1);
    expect(out[3]).toBe(10);
    expect(downsample([1, 2], 5)).toEqual([1, 2]);
  });
});

describe("maxDrawdown", () => {
  it("finds the worst peak-to-trough fall and the current distance from the high", () => {
    const dd = maxDrawdown([
      { date: "2025-01-01", value: 100 },
      { date: "2025-02-01", value: 120 },
      { date: "2025-03-01", value: 90 },
      { date: "2025-04-01", value: 110 },
    ]);
    expect(dd?.pct).toBeCloseTo(-0.25, 10); // 90 / 120 - 1
    expect(dd?.peak.date).toBe("2025-02-01");
    expect(dd?.trough.date).toBe("2025-03-01");
    expect(dd?.current).toBeCloseTo(110 / 120 - 1, 10);
  });

  it("is 0 on a rising series and null below two points", () => {
    expect(maxDrawdown([{ date: "2025-01-01", value: 1 }, { date: "2025-02-01", value: 2 }])?.pct).toBe(0);
    expect(maxDrawdown([{ date: "2025-01-01", value: 1 }])).toBeNull();
  });
});

describe("annualisedVolatility", () => {
  it("is the sample deviation of ln-returns per sqrt(year): hand-checked 0.1159", () => {
    // 365-day steps; returns ln1.1, ln0.9, ln1.1
    const v = annualisedVolatility([
      { date: "2025-01-01", value: 100 },
      { date: "2026-01-01", value: 110 },
      { date: "2027-01-01", value: 99 },
      { date: "2028-01-01", value: 108.9 },
    ]);
    expect(v).toBeCloseTo(0.1159, 3);
  });

  it("is null with too few points or a zero time step", () => {
    expect(annualisedVolatility([{ date: "2025-01-01", value: 1 }, { date: "2025-02-01", value: 2 }])).toBeNull();
    expect(
      annualisedVolatility([
        { date: "2025-01-01", value: 1 },
        { date: "2025-01-01", value: 2 },
        { date: "2025-02-01", value: 3 },
      ]),
    ).toBeNull();
  });
});

describe("cagr and shareOf", () => {
  it("compounds: 100 to 121 over 2 years is 10 %", () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1, 10);
    expect(cagr(0, 121, 2)).toBeNull();
    expect(cagr(100, 121, 0.01)).toBeNull();
  });
  it("shareOf is null for an unknown or empty total", () => {
    expect(shareOf(25, 100)).toBe(0.25);
    expect(shareOf(25, 0)).toBeNull();
    expect(shareOf(25, null)).toBeNull();
  });
});
