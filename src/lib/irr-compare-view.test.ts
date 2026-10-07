import { describe, expect, it } from "vitest";
import {
  computeHoldingSide,
  computeManualSide,
  cumulativeSeries,
  formatPoints,
  formatRate,
  horizonsDiffer,
  isHoldingAvailable,
  parseLocaleNumber,
  rateDifferencePp,
  validateManual,
} from "./irr-compare-view";
import type { ComparableHolding } from "./irr-compare-types";

describe("parseLocaleNumber", () => {
  it("parses English, French, German and Swiss formats", () => {
    expect(parseLocaleNumber("30,000", "en-US")).toBe(30000);
    expect(parseLocaleNumber("1,234.5", "en-US")).toBe(1234.5);
    expect(parseLocaleNumber("1 234,5", "fr-FR")).toBe(1234.5);
    expect(parseLocaleNumber("1\u202f234,5", "fr-FR")).toBe(1234.5);
    expect(parseLocaleNumber("1.234,5", "de-DE")).toBe(1234.5);
    expect(parseLocaleNumber("1.500", "de-DE")).toBe(1500);
    expect(parseLocaleNumber("2.5", "de-DE")).toBe(2.5);
    expect(parseLocaleNumber("30'000", "de-CH")).toBe(30000);
    expect(parseLocaleNumber("2,5", "en-US")).toBe(2.5);
  });
  it("rejects empty and garbage", () => {
    expect(parseLocaleNumber("", "en-US")).toBeNull();
    expect(parseLocaleNumber("  ", "en-US")).toBeNull();
    expect(parseLocaleNumber("abc", "en-US")).toBeNull();
    expect(parseLocaleNumber("12abc", "en-US")).toBeNull();
    expect(parseLocaleNumber("1.2.3,4.5", "en-US")).toBeNull();
  });
});

describe("validateManual", () => {
  const ok = { initial: "30000", monthly: "300", final: "150000", years: "20" };
  it("accepts the advisor's example", () => {
    const v = validateManual(ok, "en-US");
    expect(v.errors).toEqual({});
    expect(v.input).toEqual({ initialCapital: 30000, monthlySaving: 300, finalCapital: 150000, years: 20 });
  });
  it("flags required, format, sign and range errors", () => {
    expect(validateManual({ ...ok, final: "" }, "en-US").errors.final).toBe("required");
    expect(validateManual({ ...ok, years: "" }, "en-US").errors.years).toBe("required");
    expect(validateManual({ ...ok, initial: "abc" }, "en-US").errors.initial).toBe("number");
    expect(validateManual({ ...ok, monthly: "-5" }, "en-US").errors.monthly).toBe("negative");
    expect(validateManual({ ...ok, final: "0" }, "en-US").errors.final).toBe("final");
    expect(validateManual({ ...ok, years: "101" }, "en-US").errors.years).toBe("years");
    expect(validateManual({ ...ok, years: "2.1" }, "en-US").errors.years).toBe("years");
    expect(validateManual({ ...ok, years: "1.5" }, "en-US").errors.years).toBeUndefined();
  });
  it("needs an initial capital or a monthly saving", () => {
    const v = validateManual({ initial: "", monthly: "0", final: "1000", years: "5" }, "en-US");
    expect(v.nothingInvested).toBe(true);
    expect(v.input).toBeNull();
    expect(validateManual({ initial: "", monthly: "", final: "", years: "" }, "en-US").blank).toBe(true);
  });
});

describe("computed sides", () => {
  it("solves the screenshot plan at 2.89 %", () => {
    const v = validateManual({ initial: "30000", monthly: "300", final: "150000", years: "20" }, "en-US");
    const side = computeManualSide("A", "AED", v.input!);
    expect(side.irr.ok && formatRate(side.irr.rate, "en-US")).toContain("2.89");
    expect(side.plan?.totalDeposits).toBe(102000);
    expect(side.summary?.moneyOut).toBeCloseTo(150000, 0);
    expect(side.series[0].value).toBeLessThan(0);
    expect(side.series[side.series.length - 1].value).toBeCloseTo(side.summary!.gain, 0);
  });

  const holding: ComparableHolding = {
    id: "h",
    name: "Villa",
    category: "Real Estate",
    currency: "AED",
    flows: [
      { date: "2020-01-01", amount: -100000 },
      { date: "2025-01-01", amount: 150000 },
    ],
    includes: { purchase: true, income: false, currentValue: true, financing: false },
  };
  it("flags excluded income and financing for a holding", () => {
    const side = computeHoldingSide("A", holding)!;
    expect(side.irr.ok).toBe(true);
    expect(side.warnings).toEqual(["income_excluded", "financing_excluded"]);
  });
  it("returns null for an unavailable holding", () => {
    const bad = { ...holding, flows: undefined, unavailable: "missing_value" as const };
    expect(isHoldingAvailable(bad)).toBe(false);
    expect(computeHoldingSide("A", bad)).toBeNull();
    expect(isHoldingAvailable({ ...holding, flows: [] })).toBe(false);
  });

  it("nets same-day flows in the cumulative series", () => {
    expect(
      cumulativeSeries([
        { date: "2021-01-01", amount: 5 },
        { date: "2020-01-01", amount: -10 },
        { date: "2021-01-01", amount: 2 },
      ]),
    ).toEqual([
      { date: "2020-01-01", value: -10 },
      { date: "2021-01-01", value: -3 },
    ]);
  });

  it("compares rates and horizons neutrally", () => {
    const a = computeHoldingSide("A", holding)!;
    const b = computeHoldingSide("B", { ...holding, flows: [{ date: "2020-01-01", amount: -100 }, { date: "2021-01-01", amount: 110 }] })!;
    const diff = rateDifferencePp(a, b)!;
    expect(diff).toBeCloseTo((a.irr.ok ? a.irr.rate : 0) * 100 - 10, 0);
    expect(horizonsDiffer(a, b)).toBe(true);
    expect(horizonsDiffer(a, a)).toBe(false);
    expect(formatPoints(1.234, "en-US")).toBe("+1.23");
    expect(formatPoints(-1.234, "en-US")).toBe("-1.23");
  });
});
