import { describe, expect, it } from "vitest";
import {
  calculateGratuity,
  entitlementFor,
  parsePlanRow,
  reconcile,
  validatePlan,
  type GratuityResult,
} from "@/lib/uae-gratuity";

// Invented fixtures only.
const wages = [{ from: "2010-01-01", basicMonthly: 12000 }];

function ok(r: GratuityResult) {
  if (!r.valid) throw new Error("expected valid: " + r.errors.join());
  return r;
}

describe("calculateGratuity: law method", () => {
  it("worked example: 10.2 years at basic 12,000 -> 261 days x 400 = 104,400", () => {
    const r = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2020-03-13", wageHistory: wages }));
    expect(r.service.wholeYears).toBe(10);
    expect(r.service.years).toBeCloseTo(10.2, 6);
    expect(r.law.daysFirstTier).toBeCloseTo(105, 6);
    expect(r.law.daysSecondTier).toBeCloseTo(156, 6);
    expect(r.law.totalDays).toBeCloseTo(261, 6);
    expect(r.law.amount).toBeCloseTo(104400, 1);
    expect(r.law.capped).toBe(false);
    expect(r.outstanding).toBeCloseTo(104400, 1);
  });

  it("nothing below one year, with a warning", () => {
    const r = ok(calculateGratuity({ startDate: "2025-03-01", endDate: "2025-12-31", wageHistory: wages }));
    expect(r.law.amount).toBe(0);
    expect(r.warnings).toContain("grat_w_under_one_year");
  });

  it("exactly 5 years = 105 days (inclusive end date)", () => {
    const r = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2014-12-31", wageHistory: wages }));
    expect(r.service.years).toBe(5);
    expect(r.law.totalDays).toBe(105);
    expect(r.law.amount).toBe(42000);
  });

  it("exactly 1 year is the first payable point (21 days)", () => {
    const r = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2010-12-31", wageHistory: wages }));
    expect(r.law.totalDays).toBe(21);
  });

  it("applies the 24-month cap", () => {
    const r = ok(calculateGratuity({ startDate: "1990-01-01", endDate: "2025-12-31", wageHistory: wages }));
    expect(r.law.capped).toBe(true);
    expect(r.law.amount).toBe(24 * 12000);
    expect(r.law.uncapped).toBeGreaterThan(r.law.cap);
    expect(r.warnings).toContain("grat_w_cap_reached");
    expect(r.monthlyAccrual).toBe(0);
  });

  it("uses the LAST basic wage, whatever the entry order", () => {
    const r = ok(
      calculateGratuity({
        startDate: "2010-01-01",
        endDate: "2019-12-31",
        wageHistory: [
          { from: "2018-01-01", basicMonthly: 15000 },
          { from: "2010-01-01", basicMonthly: 9000 },
        ],
      }),
    );
    expect(r.lastBasic).toBe(15000);
    expect(r.law.amount).toBe(((105 + 150) * 15000) / 30);
  });

  it("unpaid leave days are not service", () => {
    const base = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2019-12-31", wageHistory: wages }));
    const lessLeave = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2019-12-31", wageHistory: wages, unpaidLeaveDays: 73 }));
    expect(base.service.years).toBe(10);
    expect(lessLeave.service.years).toBeLessThan(base.service.years - 0.19);
    expect(lessLeave.law.amount).toBeLessThan(base.law.amount);
  });

  it("unpaid leave larger than service gives zero and a warning", () => {
    const r = ok(calculateGratuity({ startDate: "2020-01-01", endDate: "2021-12-31", wageHistory: wages, unpaidLeaveDays: 5000 }));
    expect(r.law.amount).toBe(0);
    expect(r.warnings).toContain("grat_w_unpaid_leave_exceeds");
  });

  it("monthly accrual follows the tier", () => {
    const a = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2012-12-31", wageHistory: wages }));
    expect(a.monthlyAccrual).toBeCloseTo((21 / 12) * 400, 2);
    const b = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2017-12-31", wageHistory: wages }));
    expect(b.monthlyAccrual).toBeCloseTo((30 / 12) * 400, 2);
  });
});

describe("payments, outstanding and reconciliation", () => {
  const input = {
    startDate: "2010-01-01",
    endDate: "2020-03-13",
    wageHistory: wages,
    payments: [{ date: "2020-01-01", amount: 90000, note: "invented" }],
  };

  it("outstanding = entitlement - paid", () => {
    const r = ok(calculateGratuity(input));
    expect(r.paid.total).toBe(90000);
    expect(r.paid.lastDate).toBe("2020-01-01");
    expect(r.outstanding).toBeCloseTo(14400, 1);
    expect(r.overpaidBy).toBe(0);
  });

  it("payments larger than the entitlement: outstanding 0, overpaid flagged", () => {
    const r = ok(calculateGratuity({ ...input, payments: [{ date: "2020-01-01", amount: 200000, note: "" }] }));
    expect(r.outstanding).toBe(0);
    expect(r.overpaidBy).toBeCloseTo(95600, 1);
    expect(r.warnings).toContain("grat_w_overpaid");
  });

  it("ignores invalid payments with a warning", () => {
    const r = ok(calculateGratuity({ ...input, payments: [{ date: "nope", amount: 5, note: "" }, { date: "2020-01-01", amount: -1, note: "" }] }));
    expect(r.paid.total).toBe(0);
    expect(r.warnings).toContain("grat_w_payment_ignored");
  });

  it("since-last-payment covers the unpaid service after the last payment", () => {
    const r = ok(calculateGratuity(input));
    expect(r.sinceLastPayment.from).toBe("2020-01-02");
    expect(r.sinceLastPayment.years).toBeCloseTo(0.2, 1);
    // 10.2y - 10.0y of entitlement at the last basic: (10.2-10)*30 days * 400 = ~2,400
    expect(r.sinceLastPayment.entitlement).toBeGreaterThan(2000);
    expect(r.sinceLastPayment.entitlement).toBeLessThan(3000);
  });

  it("with no payments the since-last view equals the whole entitlement", () => {
    const r = ok(calculateGratuity({ ...input, payments: [] }));
    expect(r.sinceLastPayment.from).toBe("2010-01-01");
    expect(r.sinceLastPayment.entitlement).toBe(r.law.amount);
  });

  it("reconciles against the employer's stated figure", () => {
    const r = ok(calculateGratuity({ ...input, employerStatedBalance: 10000 }));
    expect(r.reconciliation?.status).toBe("employer_lower");
    expect(r.reconciliation?.difference).toBeCloseTo(-4400, 1);
    expect(reconcile(14400, 14400)?.status).toBe("match");
    expect(reconcile(20000, 14400)?.status).toBe("employer_higher");
    expect(reconcile(null, 5)).toBeNull();
    expect(reconcile(Number.NaN, 5)).toBeNull();
  });
});

describe("period-accrual view", () => {
  it("equals the law method with a single wage", () => {
    const r = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2020-03-13", wageHistory: wages }));
    expect(r.period.amount).toBeCloseTo(r.law.amount, 0);
    expect(Math.abs(r.period.difference)).toBeLessThan(1);
  });

  it("is lower than the law method when the wage rose", () => {
    const r = ok(
      calculateGratuity({
        startDate: "2010-01-01",
        endDate: "2019-12-31",
        wageHistory: [
          { from: "2010-01-01", basicMonthly: 8000 },
          { from: "2015-01-01", basicMonthly: 12000 },
        ],
      }),
    );
    expect(r.period.slices).toHaveLength(2);
    expect(r.period.amount).toBeLessThan(r.law.amount);
    expect(r.period.difference).toBeLessThan(0);
    expect(r.period.slices[0].serviceYears).toBeCloseTo(5, 1);
  });

  it("warns when the first wage starts after the employment start", () => {
    const r = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2019-12-31", wageHistory: [{ from: "2012-01-01", basicMonthly: 5000 }] }));
    expect(r.warnings).toContain("grat_w_wage_before_start");
  });
});

describe("invalid input never throws", () => {
  it("reports errors", () => {
    expect(calculateGratuity({ startDate: "2020-13-45", wageHistory: wages })).toEqual({ valid: false, errors: ["grat_err_start"] });
    const r = calculateGratuity({ startDate: "2020-01-01", endDate: "2019-01-01", wageHistory: [] });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors).toEqual(expect.arrayContaining(["grat_err_end", "grat_err_wage"]));
    expect(calculateGratuity({ startDate: "2020-01-01", wageHistory: wages, unpaidLeaveDays: -3 }).valid).toBe(false);
    expect(() => calculateGratuity(null as never)).not.toThrow();
    expect(calculateGratuity({ startDate: "2020-01-01", wageHistory: "x" as never }).valid).toBe(false);
  });

  it("defaults the end date to today", () => {
    const r = ok(calculateGratuity({ startDate: "2010-01-01", today: "2020-03-13", wageHistory: wages }));
    expect(r.endDate).toBe("2020-03-13");
  });

  it("drops bad wage entries", () => {
    const r = ok(calculateGratuity({ startDate: "2010-01-01", endDate: "2019-12-31", wageHistory: [{ from: "bad", basicMonthly: 5 }, { from: "2010-01-01", basicMonthly: -1 }, { from: "2010-01-01", basicMonthly: 12000 }] }));
    expect(r.lastBasic).toBe(12000);
  });
});

describe("entitlementFor", () => {
  it("handles junk", () => {
    expect(entitlementFor(Number.NaN, 1000).amount).toBe(0);
    expect(entitlementFor(10, -5).amount).toBe(0);
  });
});

describe("validatePlan / parsePlanRow", () => {
  const plan = {
    employer: " Acme ",
    start_date: "2010-01-01",
    end_date: null,
    contract_type: "unlimited",
    unpaid_leave_days: 0,
    wage_history: [{ from: "2015-01-01", basicMonthly: 12000 }, { from: "2010-01-01", basicMonthly: 9000 }],
    payments: [{ date: "2020-01-01", amount: 1000, note: " x " }],
    employer_stated_balance: null,
    currency: "aed",
    notes: "",
  };

  it("cleans and sorts", () => {
    const v = validatePlan(plan);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.employer).toBe("Acme");
      expect(v.value.currency).toBe("AED");
      expect(v.value.wage_history[0].from).toBe("2010-01-01");
      expect(v.value.payments[0].note).toBe("x");
    }
  });

  it.each([
    [{ employer: "" }, "grat_err_employer"],
    [{ start_date: "2010-02-30" }, "grat_err_start"],
    [{ end_date: "2009-01-01" }, "grat_err_end"],
    [{ contract_type: "x" }, "grat_err_contract"],
    [{ unpaid_leave_days: 1.5 }, "grat_err_unpaid_leave"],
    [{ wage_history: [] }, "grat_err_wage"],
    [{ wage_history: Array.from({ length: 51 }, () => ({ from: "2010-01-01", basicMonthly: 1 })) }, "grat_err_wage_count"],
    [{ payments: [{ date: "2020-01-01", amount: -1, note: "" }] }, "grat_err_payment"],
    [{ payments: Array.from({ length: 101 }, () => ({ date: "2020-01-01", amount: 1, note: "" })) }, "grat_err_payment_count"],
    [{ employer_stated_balance: -4 }, "grat_err_stated"],
    [{ currency: "AEDX" }, "grat_err_currency"],
    [{ notes: "a".repeat(2001) }, "grat_err_notes"],
  ])("rejects %j", (over, code) => {
    const v = validatePlan({ ...plan, ...over });
    expect(v).toEqual({ ok: false, error: code });
  });

  it("never throws on junk", () => {
    expect(validatePlan(null).ok).toBe(false);
    expect(parsePlanRow(null)).toBeNull();
  });

  it("parses a DB row (numeric strings from numeric columns)", () => {
    const p = parsePlanRow({ id: "p1", ...plan, employer_stated_balance: "5000.50" });
    expect(p?.id).toBe("p1");
    expect(p?.employer_stated_balance).toBe(5000.5);
  });
});
