import { describe, expect, it } from "vitest";
import { cashRunway, monthlyFlows, statementInfo, toCashTxs, topSpend, type CashTx } from "./cash";

// Invented fixtures.
const TXS: CashTx[] = [
  { date: "2025-07-02", amount: 5000, description: "SALARY ACME" },
  { date: "2025-07-05", amount: -1500, description: "Rent July" },
  { date: "2025-07-20", amount: -500, description: "Cinema night" },
  { date: "2025-08-02", amount: 5000, description: "SALARY ACME" },
  { date: "2025-08-06", amount: -1500, description: "Rent August" },
  { date: "2025-08-22", amount: -1000, description: "Weekend trip" },
  { date: "2025-09-03", amount: 100, description: "Refund" },
];

describe("toCashTxs", () => {
  it("coerces string amounts and drops invalid rows", () => {
    expect(
      toCashTxs([
        { booked_date: "2025-01-02", amount: "-12.5", description: null },
        { booked_date: "bad", amount: 1, description: "x" },
        { booked_date: "2025-01-03", amount: "abc", description: "y" },
      ]),
    ).toEqual([{ date: "2025-01-02", amount: -12.5, description: "" }]);
  });
});

describe("monthlyFlows", () => {
  it("sums inflow / outflow / net per month", () => {
    const m = monthlyFlows(TXS);
    expect(m.map((x) => x.month)).toEqual(["2025-07", "2025-08", "2025-09"]);
    expect(m[0]).toEqual({ month: "2025-07", inflow: 5000, outflow: 2000, net: 3000, count: 3 });
    expect(m[1]).toMatchObject({ inflow: 5000, outflow: 2500, net: 2500 });
    expect(m[2]).toMatchObject({ inflow: 100, outflow: 0, net: 100 });
  });
  it("keeps only the latest months asked for", () => {
    expect(monthlyFlows(TXS, 2).map((x) => x.month)).toEqual(["2025-08", "2025-09"]);
  });
});

describe("topSpend", () => {
  it("totals outflows, ranks merchants and splits essential from discretionary", () => {
    const s = topSpend(TXS);
    expect(s).not.toBeNull();
    expect(s!.total).toBe(4500);
    expect(s!.essential + s!.discretionary).toBe(4500);
    expect(s!.rows[0].total).toBeGreaterThanOrEqual(s!.rows[1].total);
    expect(s!.rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(1, 10);
  });
  it("folds the tail into one row and is null without outflows", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ date: "2025-07-01", amount: -(10 + i), description: `Shop${"abcde"[i]} Place` }));
    const s = topSpend(many, 2);
    expect(s!.rows).toHaveLength(3);
    expect(s!.rows[2].key).toBe("");
    expect(topSpend([{ date: "2025-07-01", amount: 10, description: "in" }])).toBeNull();
  });
});

describe("cashRunway", () => {
  it("is balance over the average outflow of the complete months with data", () => {
    // As of 2025-09-15 the last 3 complete months are Jun, Jul, Aug; only Jul (2000) and Aug (2500) have data.
    const r = cashRunway(9000, TXS, "2025-09-15", 3);
    expect(r?.monthsUsed).toBe(2);
    expect(r?.monthlyOutflow).toBe(2250);
    expect(r?.months).toBeCloseTo(4, 10);
  });
  it("is null without balance or outflows", () => {
    expect(cashRunway(0, TXS, "2025-09-15")).toBeNull();
    expect(cashRunway(100, [], "2025-09-15")).toBeNull();
  });
});

describe("statementInfo", () => {
  it("reports the newest transaction, the balance date and its age", () => {
    const s = statementInfo(TXS, [{ date: "2025-09-10", value: 1 }], "2025-09-20");
    expect(s).toEqual({ lastTransaction: "2025-09-03", balanceAsOf: "2025-09-10", ageDays: 17 });
    expect(statementInfo([], [], "2025-09-20")).toEqual({ lastTransaction: null, balanceAsOf: null, ageDays: null });
  });
});
