import { describe, expect, it } from "vitest";
import { analyseIncomeCalendar } from "./income-calendar-analysis";
import { emptyByKind } from "./income-calendar-liabilities";
import type { IncomeCalendar } from "./income-calendar";

const month = (key: string, rental: number, earnedAmount: number, mortgage: number) => ({
  month: key,
  total: rental,
  bySource: { rental, stocks: 0, reit: 0, private_equity: 0 },
  items: [],
  earned: { salary: earnedAmount, bonus: 0, gratuity: 0, other: 0 },
  earnedItems: [],
  liabilities: { ...emptyByKind(), mortgage },
  liabilityTotal: mortgage,
  liabilityItems: [],
});
const cal = (): IncomeCalendar => ({
  months: [month("2026-11", 1000, 5000, 4000), month("2026-12", 1000, 0, 4000), month("2027-01", 1000, 0, 4000)],
  annualTotal: 3000,
  monthCount: 3,
  liabilityAnnual: 12000,
  monthlyAverage: 1000,
  peakMonth: "2026-11",
  yieldOnCostPct: null,
  currentYieldPct: null,
  costBasis: 0,
  marketValue: 0,
});

describe("analyseIncomeCalendar", () => {
  it("computes gross, liabilities, net and the running net per month and per year", () => {
    const a = analyseIncomeCalendar(cal(), true);
    expect(a.totals).toEqual({ gross: 8000, earned: 5000, passive: 3000, liabilities: 12000, net: -4000 });
    expect(a.rows.map((r) => r.net)).toEqual([2000, -3000, -3000]);
    expect(a.rows.map((r) => r.cumulative)).toEqual([2000, -1000, -4000]);
    expect(a.years.map((y) => [y.year, y.gross, y.net])).toEqual([["2026", 7000, -1000], ["2027", 1000, -3000]]);
  });
  it("finds the weak months, the shortfall and the main liability / source", () => {
    const a = analyseIncomeCalendar(cal(), true);
    expect(a.negativeMonths).toBe(2);
    expect(a.firstShortfall).toBe("2026-12");
    expect(a.bestMonth?.month).toBe("2026-11");
    expect(a.topLiability?.kind).toBe("mortgage");
    expect(a.topSource?.source).toBe("earned");
    expect(a.coverage).toBeCloseTo(8000 / 12000);
  });
  it("leaves earned income out when switched off", () => {
    const a = analyseIncomeCalendar(cal(), false);
    expect(a.totals.gross).toBe(3000);
    expect(a.earnedSharePct).toBe(0);
  });
});
