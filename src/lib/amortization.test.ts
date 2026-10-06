import { describe, expect, it } from "vitest";
import {
  canAmortize,
  generateAmortizationSchedule,
  getOutstandingPrincipalAt,
  getRateForMonth,
  summarizeAmortization,
} from "@/lib/amortization";
import { EMPTY_REAL_ESTATE_METADATA, type LinkedLoan } from "@/lib/real-estate";

const loan = (over: Partial<LinkedLoan> = {}): LinkedLoan => ({
  ...EMPTY_REAL_ESTATE_METADATA.linked_loan,
  amount: 12000,
  interest_rate: 12,
  duration_months: 12,
  start_date: "2025-01-15",
  ...over,
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("canAmortize", () => {
  it("is true with amount, duration, start date and a rate", () => {
    expect(canAmortize(loan())).toBe(true);
  });

  it("accepts a 0% rate (rate present, just zero)", () => {
    expect(canAmortize(loan({ interest_rate: 0 }))).toBe(true);
  });

  it.each([
    ["no amount", { amount: null }],
    ["zero amount", { amount: 0 }],
    ["negative amount", { amount: -5 }],
    ["no duration", { duration_months: null }],
    ["zero duration", { duration_months: 0 }],
    ["no start date", { start_date: "" }],
    ["no rate", { interest_rate: null }],
  ] as [string, Partial<LinkedLoan>][])("is false with %s", (_label, over) => {
    expect(canAmortize(loan(over))).toBe(false);
  });
});

describe("getRateForMonth", () => {
  it("fixed loans use interest_rate throughout, ignoring hybrid fields", () => {
    const l = loan({ rate_type: "fixed", interest_rate: 3.99, reference_rate: 9, variable_margin: 9, fixed_period_months: 1 });
    expect(getRateForMonth(l, 1)).toBe(3.99);
    expect(getRateForMonth(l, 200)).toBe(3.99);
  });

  it("a missing rate on a fixed loan counts as 0", () => {
    expect(getRateForMonth(loan({ interest_rate: null }), 1)).toBe(0);
  });

  const hybrid = (over: Partial<LinkedLoan> = {}) =>
    loan({
      rate_type: "hybrid",
      interest_rate: 3,
      fixed_period_months: 12,
      reference_rate: 4,
      variable_margin: 1.5,
      floor_rate: null,
      salary_transfer_active: true,
      fallback_rate: null,
      ...over,
    });

  it("hybrid: teaser rate through the last fixed month (boundary inclusive)", () => {
    expect(getRateForMonth(hybrid(), 1)).toBe(3);
    expect(getRateForMonth(hybrid(), 12)).toBe(3);
  });

  it("hybrid: reference + margin from the month after the fixed period", () => {
    expect(getRateForMonth(hybrid(), 13)).toBe(5.5);
  });

  it("hybrid: the floor lifts a too-low variable rate and never lowers a higher one", () => {
    expect(getRateForMonth(hybrid({ floor_rate: 6 }), 13)).toBe(6);
    expect(getRateForMonth(hybrid({ floor_rate: 2 }), 13)).toBe(5.5);
  });

  it("hybrid: lapsed salary transfer uses the fallback rate instead of the variable rate", () => {
    expect(getRateForMonth(hybrid({ salary_transfer_active: false, fallback_rate: 7.25 }), 13)).toBe(7.25);
  });

  it("hybrid: lapsed salary transfer without a fallback keeps the fixed rate; floor still applies", () => {
    expect(getRateForMonth(hybrid({ salary_transfer_active: false }), 13)).toBe(3);
    expect(getRateForMonth(hybrid({ salary_transfer_active: false, fallback_rate: 1, floor_rate: 4 }), 13)).toBe(4);
  });

  it("hybrid: without a fixed period the variable rate applies from month 1", () => {
    expect(getRateForMonth(hybrid({ fixed_period_months: null }), 1)).toBe(5.5);
  });

  it("hybrid: missing reference/margin count as 0", () => {
    expect(getRateForMonth(hybrid({ reference_rate: null, variable_margin: null }), 13)).toBe(0);
  });
});

describe("generateAmortizationSchedule", () => {
  it("returns [] when the loan cannot be amortized", () => {
    expect(generateAmortizationSchedule(loan({ amount: null }))).toEqual([]);
    expect(generateAmortizationSchedule(loan({ start_date: "" }))).toEqual([]);
  });

  it("0% rate: equal payments of amount / months, no interest", () => {
    const s = generateAmortizationSchedule(loan({ interest_rate: 0 }));
    expect(s).toHaveLength(12);
    for (const e of s) {
      expect(e.paymentAmount).toBeCloseTo(1000, 8);
      expect(e.interestAmount).toBe(0);
      expect(e.principalAmount).toBeCloseTo(1000, 8);
    }
    expect(s[11].remainingBalance).toBeCloseTo(0, 8);
  });

  it("12% on 12000 over 12 months: classic level payment of 1066.19", () => {
    const s = generateAmortizationSchedule(loan());
    expect(s).toHaveLength(12);
    expect(s[0].paymentAmount).toBeCloseTo(1066.1855, 3);
    expect(s[0].interestAmount).toBeCloseTo(120, 8); // 12000 * 1%
    expect(s[0].principalAmount).toBeCloseTo(946.1855, 3);
    expect(s[0].remainingBalance).toBeCloseTo(12000 - 946.1855, 3);
    expect(s[0].rateUsed).toBe(12);
  });

  it("20-year 6% mortgage on 200000 has the textbook 1432.86 payment", () => {
    const s = generateAmortizationSchedule(loan({ amount: 200000, interest_rate: 6, duration_months: 240 }));
    expect(s).toHaveLength(240);
    expect(s[0].paymentAmount).toBeCloseTo(1432.8621, 3);
    expect(s[0].interestAmount).toBeCloseTo(1000, 8);
  });

  it("invariants: principal sums to the amount, balance ends at 0, payment = interest + principal", () => {
    for (const l of [
      loan(),
      loan({ interest_rate: 0 }),
      loan({ amount: 250000, interest_rate: 4.25, duration_months: 300 }),
      loan({ amount: 1, interest_rate: 9, duration_months: 7 }),
    ]) {
      const s = generateAmortizationSchedule(l);
      expect(sum(s.map((e) => e.principalAmount))).toBeCloseTo(l.amount as number, 6);
      expect(s[s.length - 1].remainingBalance).toBeCloseTo(0, 6);
      let prev = l.amount as number;
      s.forEach((e, i) => {
        expect(e.paymentNumber).toBe(i + 1);
        expect(e.paymentAmount).toBeCloseTo(e.interestAmount + e.principalAmount, 8);
        expect(e.remainingBalance).toBeCloseTo(prev - e.principalAmount, 8);
        expect(e.remainingBalance).toBeLessThanOrEqual(prev + 1e-9);
        expect(e.remainingBalance).toBeGreaterThanOrEqual(0);
        prev = e.remainingBalance;
      });
    }
  });

  it("interest falls and principal rises month over month on a fixed loan", () => {
    const s = generateAmortizationSchedule(loan({ amount: 100000, interest_rate: 5, duration_months: 60 }));
    for (let i = 1; i < s.length; i++) {
      expect(s[i].interestAmount).toBeLessThan(s[i - 1].interestAmount);
      expect(s[i].principalAmount).toBeGreaterThan(s[i - 1].principalAmount);
    }
  });

  it("a one-month loan repays everything plus one month of interest at once", () => {
    const s = generateAmortizationSchedule(loan({ amount: 1000, interest_rate: 12, duration_months: 1 }));
    expect(s).toHaveLength(1);
    expect(s[0].interestAmount).toBeCloseTo(10, 8);
    expect(s[0].principalAmount).toBeCloseTo(1000, 8);
    expect(s[0].remainingBalance).toBeCloseTo(0, 8);
  });

  it("dates: first installment one calendar month after start, then monthly", () => {
    const s = generateAmortizationSchedule(loan({ start_date: "2025-01-15", duration_months: 4, amount: 4000, interest_rate: 0 }));
    expect(s.map((e) => e.date)).toEqual(["2025-02-15", "2025-03-15", "2025-04-15", "2025-05-15"]);
  });

  it("dates roll over the year end", () => {
    const s = generateAmortizationSchedule(loan({ start_date: "2025-11-10", duration_months: 3, amount: 3000, interest_rate: 0 }));
    expect(s.map((e) => e.date)).toEqual(["2025-12-10", "2026-01-10", "2026-02-10"]);
  });

  it("dates across a leap day stay on the same day of month", () => {
    const s = generateAmortizationSchedule(loan({ start_date: "2023-12-29", duration_months: 3, amount: 3000, interest_rate: 0 }));
    expect(s.map((e) => e.date)).toEqual(["2024-01-29", "2024-02-29", "2024-03-29"]);
  });

  // BUG (amortization.ts addMonths, line ~45): setUTCMonth overflows on short
  // months, so a loan starting on the 31st gets its first installment on 3 March
  // instead of the last day of February.
  it.fails("a loan starting on the 31st has its first installment on the last day of the next short month", () => {
    const s = generateAmortizationSchedule(loan({ start_date: "2025-01-31", duration_months: 2, amount: 2000, interest_rate: 0 }));
    expect(s[0].date).toBe("2025-02-28");
  });

  describe("hybrid rate structure", () => {
    const hybrid = loan({
      amount: 100000,
      duration_months: 24,
      rate_type: "hybrid",
      interest_rate: 3,
      fixed_period_months: 12,
      reference_rate: 3.5,
      variable_margin: 1.5,
      floor_rate: null,
      salary_transfer_active: true,
    });

    it("applies the teaser rate then the variable rate, recomputing the payment at the switch", () => {
      const s = generateAmortizationSchedule(hybrid);
      expect(s).toHaveLength(24);
      expect(s.slice(0, 12).every((e) => e.rateUsed === 3)).toBe(true);
      expect(s.slice(12).every((e) => e.rateUsed === 5)).toBe(true);

      // Level payment held constant within each rate segment...
      expect(s[0].paymentAmount).toBeCloseTo(4298.1212, 3);
      expect(s[11].paymentAmount).toBeCloseTo(4298.1212, 3);
      // ...balance after the teaser period, and a re-amortised payment on it.
      expect(s[11].remainingBalance).toBeCloseTo(50749.008, 2);
      expect(s[12].paymentAmount).toBeCloseTo(4344.4948, 3);
      expect(s[23].paymentAmount).toBeCloseTo(4344.4948, 3);
      expect(s[23].remainingBalance).toBeCloseTo(0, 6);
    });

    it("still fully repays the principal", () => {
      const s = generateAmortizationSchedule(hybrid);
      expect(sum(s.map((e) => e.principalAmount))).toBeCloseTo(100000, 6);
    });

    it("a lapsed salary transfer raises the post-teaser payment via the fallback rate", () => {
      const base = generateAmortizationSchedule(hybrid);
      const lapsed = generateAmortizationSchedule({ ...hybrid, salary_transfer_active: false, fallback_rate: 8 });
      expect(lapsed[12].rateUsed).toBe(8);
      expect(lapsed[12].paymentAmount).toBeGreaterThan(base[12].paymentAmount);
      // Months before the switch are identical.
      expect(lapsed[5]).toEqual(base[5]);
    });
  });
});

describe("getOutstandingPrincipalAt", () => {
  it("falls back to outstanding_principal, then amount, then 0 when not amortizable", () => {
    expect(getOutstandingPrincipalAt(loan({ start_date: "", outstanding_principal: 4000 }), "2030-01-01")).toBe(4000);
    expect(getOutstandingPrincipalAt(loan({ start_date: "", outstanding_principal: null, amount: 9000 }), "2030-01-01")).toBe(9000);
    expect(getOutstandingPrincipalAt(loan({ start_date: "", outstanding_principal: null, amount: null }), "2030-01-01")).toBe(0);
  });

  it("the full principal on and before the start date", () => {
    expect(getOutstandingPrincipalAt(loan(), "2024-06-01")).toBe(12000);
    expect(getOutstandingPrincipalAt(loan(), "2025-01-15")).toBe(12000);
  });

  it("the full principal between the start date and the first installment (not 0)", () => {
    expect(getOutstandingPrincipalAt(loan(), "2025-01-20")).toBe(12000);
    expect(getOutstandingPrincipalAt(loan(), "2025-02-14")).toBe(12000);
  });

  it("drops by the first installment's principal exactly on its due date", () => {
    const s = generateAmortizationSchedule(loan());
    expect(getOutstandingPrincipalAt(loan(), "2025-02-15")).toBeCloseTo(s[0].remainingBalance, 8);
    expect(getOutstandingPrincipalAt(loan(), "2025-03-14")).toBeCloseTo(s[0].remainingBalance, 8);
    expect(getOutstandingPrincipalAt(loan(), "2025-03-15")).toBeCloseTo(s[1].remainingBalance, 8);
  });

  it("is 0 once fully repaid and stays 0 afterwards", () => {
    expect(getOutstandingPrincipalAt(loan(), "2026-01-15")).toBeCloseTo(0, 6);
    expect(getOutstandingPrincipalAt(loan(), "2040-01-01")).toBeCloseTo(0, 6);
  });

  it("never increases as time passes", () => {
    let prev = Infinity;
    for (const d of ["2025-01-15", "2025-04-01", "2025-07-01", "2025-10-01", "2026-02-01"]) {
      const v = getOutstandingPrincipalAt(loan(), d);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("summarizeAmortization", () => {
  it("before the first installment nothing is paid and all principal is outstanding", () => {
    const r = summarizeAmortization(loan(), "2025-01-31");
    expect(r.principalPaidToDate).toBe(0);
    expect(r.interestPaidToDate).toBe(0);
    expect(r.outstandingPrincipal).toBe(12000);
    expect(r.percentPaid).toBe(0);
    expect(r.totalPrincipal).toBe(12000);
  });

  it("totals: interest = sum of schedule interest; total payments = principal + interest", () => {
    const r = summarizeAmortization(loan(), "2025-01-31");
    expect(r.totalInterest).toBeCloseTo(sum(r.schedule.map((e) => e.interestAmount)), 8);
    expect(r.totalInterest).toBeCloseTo(12 * 1066.1855 - 12000, 2);
    expect(sum(r.schedule.map((e) => e.paymentAmount))).toBeCloseTo(r.totalPrincipal + r.totalInterest, 6);
  });

  it("mid-way: counts only installments due on/before the as-of date", () => {
    const r = summarizeAmortization(loan(), "2025-06-15"); // installments 1..5
    const first5 = r.schedule.slice(0, 5);
    expect(r.principalPaidToDate).toBeCloseTo(sum(first5.map((e) => e.principalAmount)), 8);
    expect(r.interestPaidToDate).toBeCloseTo(sum(first5.map((e) => e.interestAmount)), 8);
    expect(r.outstandingPrincipal).toBeCloseTo(first5[4].remainingBalance, 8);
    expect(r.percentPaid).toBeCloseTo((r.principalPaidToDate / 12000) * 100, 8);
    // paid + outstanding = original principal
    expect(r.principalPaidToDate + r.outstandingPrincipal).toBeCloseTo(12000, 6);
  });

  it("after the end: 100% paid, nothing outstanding", () => {
    const r = summarizeAmortization(loan(), "2030-01-01");
    expect(r.percentPaid).toBeCloseTo(100, 6);
    expect(r.outstandingPrincipal).toBeCloseTo(0, 6);
    expect(r.interestPaidToDate).toBeCloseTo(r.totalInterest, 8);
  });

  it("non-amortizable loan: empty schedule, zero interest, 0% paid, no crash", () => {
    const r = summarizeAmortization(loan({ start_date: "" }), "2030-01-01");
    expect(r.schedule).toEqual([]);
    expect(r.totalInterest).toBe(0);
    expect(r.percentPaid).toBe(0);
    expect(r.outstandingPrincipal).toBe(12000);
  });

  it("no amount at all: totalPrincipal 0 and percentPaid 0 (no divide-by-zero)", () => {
    const r = summarizeAmortization(loan({ amount: null }), "2030-01-01");
    expect(r.totalPrincipal).toBe(0);
    expect(r.percentPaid).toBe(0);
  });

  it("defaults the as-of date to today without throwing", () => {
    const r = summarizeAmortization(loan({ start_date: "2000-01-01" }));
    expect(r.percentPaid).toBeCloseTo(100, 6);
  });
});
