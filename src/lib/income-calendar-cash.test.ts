import { describe, expect, it } from "vitest";
import { isPersonalCash, monthEndCash, shiftMonth, type CashAsset } from "./income-calendar-cash";
import { settleCurrentMonth } from "./income-calendar-settle";
import { analyseIncomeCalendar } from "./income-calendar-analysis";
import { emptyByKind } from "./income-calendar-liabilities";
import type { IncomeCalendar, IncomeCalendarMonth } from "./income-calendar";

const cash = (over: Partial<CashAsset> = {}): CashAsset => ({ id: "a", currency: "AED", current_value: 1000, is_liability: false, metadata: {}, asset_categories: { name: "Cash" }, ...over });

describe("isPersonalCash", () => {
  it("keeps personal open bank accounts only", () => {
    expect(isPersonalCash(cash())).toBe(true);
    expect(isPersonalCash(cash({ metadata: { company_id: "c" } }))).toBe(false);
    expect(isPersonalCash(cash({ metadata: { closed_on: "2026-02-26" } }))).toBe(false);
    expect(isPersonalCash(cash({ metadata: { bank_profile: "banque_populaire_card" } }))).toBe(false);
    expect(isPersonalCash(cash({ asset_categories: { name: "Equities" } }))).toBe(false);
  });
});

describe("monthEndCash", () => {
  it("adds, per account, the newest balance on or before the last day of the month", () => {
    const accounts = [cash({ id: "a" }), cash({ id: "b" })];
    const history = [
      { asset_id: "a", recorded_date: "2026-08-20", value: 100 },
      { asset_id: "a", recorded_date: "2026-09-05", value: 150 },
      { asset_id: "b", recorded_date: "2026-08-31", value: 40 },
    ];
    const out = monthEndCash(accounts, history, ["2026-07", "2026-08", "2026-09"], "AED", { AED: 1 });
    expect(out).toEqual({ "2026-08": 140, "2026-09": 190 });
  });
  it("shifts months across a year end", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

const month = (key: string, over: Partial<IncomeCalendarMonth> = {}): IncomeCalendarMonth => ({
  month: key,
  total: 0,
  bySource: { rental: 0, stocks: 0, reit: 0, private_equity: 0 },
  items: [],
  liabilities: emptyByKind(),
  liabilityTotal: 0,
  liabilityItems: [],
  ...over,
});
const cal = (months: IncomeCalendarMonth[]): IncomeCalendar => ({ months, annualTotal: 0, monthCount: months.length, liabilityAnnual: 0, monthlyAverage: 0, peakMonth: null, yieldOnCostPct: null, currentYieldPct: null, costBasis: 0, marketValue: 0 });

describe("settleCurrentMonth", () => {
  const current = month("2026-10", {
    earned: { salary: 11550, bonus: 0, gratuity: 0, other: 0 },
    earnedItems: [
      { streamId: "s", name: "Salary", source: "Navtec", group: "salary", amount: 11550, date: "2026-10-01" },
      { streamId: "t", name: "Bonus", source: "Navtec", group: "bonus", amount: 5000, date: "2026-10-28" },
    ],
    liabilityTotal: 4087,
    liabilities: { ...emptyByKind(), mortgage: 4087 },
    liabilityItems: [{ assetId: "m", name: "Home loan", kind: "mortgage", amount: 4087, date: "2026-10-05" }],
  });

  it("flags the salary and the instalment the statements already show, not the bonus still to come", () => {
    const out = settleCurrentMonth(cal([current]), [
      { date: "2026-10-02", amount: 11550, description: "SALARY" },
      { date: "2026-10-06", amount: -4087.5, description: "LOAN" },
    ], "2026-10-10");
    const m = out.months[0];
    expect(m.earnedItems?.map((i) => !!i.settled)).toEqual([true, false]);
    expect(m.liabilityItems[0].settled).toBe(true);
    expect(m.settledIncome).toBe(11550);
    expect(m.settledPayments).toBe(4087);
  });

  it("does not match a different amount, the wrong direction, or one transaction twice", () => {
    const out = settleCurrentMonth(cal([{ ...current, earnedItems: [current.earnedItems![0], { ...current.earnedItems![0], streamId: "u" }] }]), [
      { date: "2026-10-02", amount: 9000, description: "x" },
      { date: "2026-10-02", amount: -11550, description: "y" },
      { date: "2026-10-02", amount: 11550, description: "once" },
    ], "2026-10-10");
    expect(out.months[0].earnedItems?.filter((i) => i.settled)).toHaveLength(1);
  });

  it("leaves other months and a calendar without matching transactions untouched", () => {
    const c = cal([current]);
    expect(settleCurrentMonth(c, [], "2026-10-10")).toBe(c);
    expect(settleCurrentMonth(c, [{ date: "2026-10-02", amount: 11550, description: "" }], "2026-11-10")).toBe(c);
  });
});

describe("cash position", () => {
  it("uses the bank's closing cash for a past month and today's cash for the current one, without counting settled items twice", () => {
    const sept = month("2026-09");
    const oct = { ...month("2026-10", { total: 0 }), earnedItems: [], earned: { salary: 11550, bonus: 0, gratuity: 0, other: 0 }, liabilityTotal: 4087, settledIncome: 11550, settledPayments: 4087 };
    const nov = month("2026-11", { earned: { salary: 11550, bonus: 0, gratuity: 0, other: 0 }, liabilityTotal: 4087 });
    const a = analyseIncomeCalendar(cal([sept, oct, nov]), true, { openingCash: 50000, cashBasis: true, actualCloses: { "2026-09": 42000 }, todayMonth: "2026-10" });
    // September: what the banks reported. October: today's cash (the salary and instalment are already in it).
    expect(a.rows.map((r) => r.position)).toEqual([42000, 50000, 50000 + 11550 - 4087]);
  });
  it("without the cash basis it is a running net from the opening figure", () => {
    const a = analyseIncomeCalendar(cal([month("2026-10", { liabilityTotal: 100, liabilities: { ...emptyByKind(), loan: 100 } }), month("2026-11", { liabilityTotal: 100 })]), false, { openingCash: 0 });
    expect(a.rows.map((r) => r.position)).toEqual([-100, -200]);
  });
});
