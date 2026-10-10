import { describe, expect, it } from "vitest";
import { buildLiabilitySchedule } from "./income-calendar-liabilities";
import { buildIncomeCalendar } from "./income-calendar";
import type { PassiveIncomeAsset } from "./passive-income";

const keys = ["2026-10", "2026-11", "2026-12", "2027-01"];
const asset = (over: Partial<PassiveIncomeAsset>): PassiveIncomeAsset => ({
  id: "x", name: "X", quantity: 1, current_value: 0, currency: "AED", is_liability: false, metadata: {}, asset_categories: null, ...over,
});
const same = (n: number) => n;

describe("buildLiabilitySchedule", () => {
  it("repeats loan and mortgage instalments every month and keeps their kinds apart", () => {
    const rows = buildLiabilitySchedule(
      [
        asset({ id: "l", name: "Car loan", is_liability: true, current_value: 5000, metadata: { liability_type: "loan", monthly_payment: 700 }, asset_categories: { name: "Liabilities" } }),
        asset({ id: "m", name: "Home loan", is_liability: true, current_value: 9e5, metadata: { liability_type: "mortgage", monthly_payment: 4000 }, asset_categories: { name: "Liabilities" } }),
      ],
      keys,
      same,
    );
    expect(rows.every((r) => r.length === 2)).toBe(true);
    expect(rows[0].map((i) => i.kind).sort()).toEqual(["loan", "mortgage"]);
  });

  it("stops a property mortgage when its term has ended", () => {
    const rows = buildLiabilitySchedule(
      [asset({ id: "p", name: "Flat", asset_categories: { name: "Real Estate" }, metadata: { linked_loan: { monthly_payment: 3000, start_date: "2024-12-15", duration_months: 24 } } })],
      keys,
      same,
    );
    // Term: Dec 2024 + 24 months = ends before Dec 2026 -> paid in Oct and Nov only.
    expect(rows.map((r) => r.length)).toEqual([1, 1, 0, 0]);
  });

  it("puts off-plan milestones and capital calls on their due month, overdue ones in the first month", () => {
    const rows = buildLiabilitySchedule(
      [
        asset({ id: "o", name: "Tower", asset_categories: { name: "Real Estate" }, metadata: { is_offplan: true, payment_schedule: [
          { id: "1", milestone: "A", due_date: "2026-12-01", amount: 100, percentage: 10, status: "pending" },
          { id: "2", milestone: "B", due_date: "2026-05-01", amount: 50, percentage: 5, status: "pending" },
          { id: "3", milestone: "C", due_date: "2026-11-01", amount: 70, percentage: 7, status: "paid" },
        ] } }),
        asset({ id: "f", name: "Fund", asset_categories: { name: "Private Equity" }, metadata: { capital_calls: [{ id: "c", due_date: "2027-01-10", amount: 900, percentage: 9, status: "pending" }] } }),
      ],
      keys,
      same,
    );
    expect(rows[0].map((i) => [i.kind, i.amount])).toEqual([["off_plan", 50]]);
    expect(rows[2].map((i) => [i.kind, i.amount])).toEqual([["off_plan", 100]]);
    expect(rows[3].map((i) => [i.kind, i.amount])).toEqual([["private_equity", 900]]);
  });

  it("owes a credit card without a planned payment in full now", () => {
    const rows = buildLiabilitySchedule(
      [asset({ id: "c", name: "Card", is_liability: true, current_value: 1200, metadata: { liability_type: "credit_card" }, asset_categories: { name: "Liabilities" } })],
      keys,
      same,
    );
    expect(rows[0].map((i) => [i.kind, i.amount])).toEqual([["credit_card", 1200]]);
    expect(rows[1]).toEqual([]);
  });
});

describe("buildIncomeCalendar liabilities", () => {
  it("totals the payments per month and for the year", () => {
    const cal = buildIncomeCalendar({
      assets: [asset({ id: "l", name: "Loan", is_liability: true, current_value: 1, metadata: { liability_type: "loan", monthly_payment: 100 }, asset_categories: { name: "Liabilities" } })],
      rates: { AED: 1 },
      baseCurrency: "AED",
      startDate: "2026-10-10",
    });
    expect(cal.months[0].liabilityTotal).toBe(100);
    expect(cal.liabilityAnnual).toBe(1200);
  });
});
