import { describe, expect, it } from "vitest";
import {
  addDays,
  addYears,
  averageAnnualCosts,
  buildProjection,
  cumulativeNetRentAt,
  densifyHistory,
  estimateAnnualGrowth,
  estimateOffplanValueAt,
  monthsBetween,
  offplanPaidAt,
  projectionDates,
  type HistoryChartPoint,
  type OffplanPlan,
} from "@/lib/real-estate-analytics";
import { generateAmortizationSchedule, getOutstandingPrincipalAt } from "@/lib/amortization";
import {
  EMPTY_REAL_ESTATE_METADATA,
  type LinkedLoan,
  type PropertyExpense,
  type TenancyContract,
} from "@/lib/real-estate";

const loan = (patch: Partial<LinkedLoan> = {}): LinkedLoan => ({
  ...EMPTY_REAL_ESTATE_METADATA.linked_loan,
  ...patch,
});

const contract = (patch: Partial<TenancyContract>): TenancyContract => ({
  id: "t",
  tenant_name: "T",
  start_date: "2025-01-01",
  end_date: "2025-12-31",
  annual_rent: 12000,
  contract_value: null,
  imported_from_file: "",
  uploaded_at: "",
  ...patch,
});

const expense = (date: string, amount: number): PropertyExpense => ({
  id: date,
  description: "x",
  date,
  amount,
});

describe("date helpers", () => {
  it("monthsBetween counts calendar-month differences and never goes negative", () => {
    expect(monthsBetween("2025-01-01", "2025-01-31")).toBe(0);
    expect(monthsBetween("2025-01-31", "2025-02-01")).toBe(1);
    expect(monthsBetween("2024-12-15", "2026-01-15")).toBe(13);
    expect(monthsBetween("2025-06-01", "2025-01-01")).toBe(0);
    expect(monthsBetween("2025-03-10", "2025-03-10")).toBe(0);
  });

  it("addYears adds whole years and keeps normal dates", () => {
    expect(addYears("2025-06-15", 20)).toBe("2045-06-15");
    expect(addYears("2024-02-29", 4)).toBe("2028-02-29");
    expect(addYears("2025-06-15", 0)).toBe("2025-06-15");
  });

  it("addYears from a leap day lands on 28 Feb or 1 Mar in a non-leap year", () => {
    expect(["2025-02-28", "2025-03-01"]).toContain(addYears("2024-02-29", 1));
  });

  it("addDays crosses month, year and leap-day boundaries", () => {
    expect(addDays("2025-01-31", 1)).toBe("2025-02-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2025-03-01", -1)).toBe("2025-02-28");
  });
});

describe("cumulativeNetRentAt", () => {
  const base = { schedule: [], expenses: [] as PropertyExpense[] };

  it("is all zero with no contracts", () => {
    expect(cumulativeNetRentAt({ ...base, contracts: [], date: "2025-06-01" })).toEqual({
      rent: 0,
      interest: 0,
      expenses: 0,
      net: 0,
    });
  });

  it("counts whole calendar months for an ongoing contract", () => {
    const r = cumulativeNetRentAt({
      ...base,
      contracts: [contract({ start_date: "2025-01-15", end_date: "", annual_rent: 12000 })],
      date: "2025-04-20",
    });
    expect(r.rent).toBe(3000);
  });

  it("counts a finished contract's inclusive days (a full year = 12 months of rent)", () => {
    const r = cumulativeNetRentAt({
      ...base,
      contracts: [contract({ start_date: "2025-01-01", end_date: "2025-12-31", annual_rent: 12000 })],
      date: "2026-06-01",
    });
    expect(r.rent).toBe(12000);
  });

  it("accumulates across several tenancy contracts", () => {
    const r = cumulativeNetRentAt({
      ...base,
      contracts: [
        contract({ id: "a", start_date: "2024-01-01", end_date: "2024-12-31", annual_rent: 24000 }),
        contract({ id: "b", start_date: "2025-01-01", end_date: "", annual_rent: 36000 }),
      ],
      date: "2025-04-01",
    });
    expect(r.rent).toBe(24000 + 3 * 3000);
  });

  it("ignores contracts that start after the date or have no start, and null rent", () => {
    const r = cumulativeNetRentAt({
      ...base,
      contracts: [
        contract({ id: "future", start_date: "2030-01-01" }),
        contract({ id: "nostart", start_date: "" }),
        contract({ id: "norent", start_date: "2025-01-01", end_date: "", annual_rent: null }),
      ],
      date: "2025-06-01",
    });
    expect(r.rent).toBe(0);
  });

  it("uses a flat monthly interest estimate when there is no amortization schedule", () => {
    const r = cumulativeNetRentAt({
      ...base,
      contracts: [contract({ start_date: "2025-01-01", end_date: "", annual_rent: 12000 })],
      date: "2025-04-01",
      flatMonthlyInterest: 200,
    });
    expect(r.interest).toBe(600);
    expect(r.net).toBe(3000 - 600);
  });

  it("charges only schedule interest falling inside tenancy periods up to the date", () => {
    const schedule = [
      { paymentNumber: 1, date: "2024-12-15", rateUsed: 4, paymentAmount: 0, interestAmount: 100, principalAmount: 0, remainingBalance: 0 },
      { paymentNumber: 2, date: "2025-01-15", rateUsed: 4, paymentAmount: 0, interestAmount: 90, principalAmount: 0, remainingBalance: 0 },
      { paymentNumber: 3, date: "2025-02-15", rateUsed: 4, paymentAmount: 0, interestAmount: 80, principalAmount: 0, remainingBalance: 0 },
      { paymentNumber: 4, date: "2025-09-15", rateUsed: 4, paymentAmount: 0, interestAmount: 70, principalAmount: 0, remainingBalance: 0 },
    ];
    const r = cumulativeNetRentAt({
      contracts: [contract({ start_date: "2025-01-01", end_date: "", annual_rent: 12000 })],
      schedule,
      expenses: [],
      date: "2025-03-01",
      flatMonthlyInterest: 9999,
    });
    // pre-tenancy (2024-12-15) and post-date (2025-09-15) payments excluded; flat estimate ignored
    expect(r.interest).toBe(170);
  });

  it("subtracts only expenses dated on or before the date", () => {
    const r = cumulativeNetRentAt({
      contracts: [contract({ start_date: "2025-01-01", end_date: "", annual_rent: 12000 })],
      schedule: [],
      expenses: [expense("2025-02-01", 300), expense("2025-03-01", 200), expense("2025-04-01", 999), { ...expense("", 50) }],
      date: "2025-03-01",
    });
    expect(r.expenses).toBe(500);
    expect(r.net).toBe(2000 - 500);
  });

  it("can go negative when costs exceed rent", () => {
    const r = cumulativeNetRentAt({
      contracts: [],
      schedule: [],
      expenses: [expense("2025-01-01", 1000)],
      date: "2025-06-01",
    });
    expect(r.net).toBe(-1000);
  });
});

describe("estimateAnnualGrowth", () => {
  it("falls back to 3% with fewer than two points", () => {
    expect(estimateAnnualGrowth([])).toEqual({ rate: 0.03, source: "assumed" });
    expect(estimateAnnualGrowth([{ date: "2020-01-01", value: 100 }])).toEqual({ rate: 0.03, source: "assumed" });
  });

  it("falls back when history is shorter than 2 years", () => {
    expect(
      estimateAnnualGrowth([
        { date: "2024-01-01", value: 100 },
        { date: "2025-06-01", value: 200 },
      ]).source,
    ).toBe("assumed");
  });

  it("falls back for non-positive first or last values", () => {
    expect(estimateAnnualGrowth([{ date: "2020-01-01", value: 0 }, { date: "2025-01-01", value: 100 }]).source).toBe("assumed");
    expect(estimateAnnualGrowth([{ date: "2020-01-01", value: 100 }, { date: "2025-01-01", value: 0 }]).source).toBe("assumed");
  });

  it("computes CAGR from earliest to latest, regardless of input order", () => {
    const g = estimateAnnualGrowth([
      { date: "2027-01-05", value: 121 },
      { date: "2025-01-01", value: 100 },
      { date: "2026-01-01", value: 5000 },
    ]);
    expect(g.source).toBe("history");
    expect(g.rate).toBeCloseTo(0.1, 2);
  });

  it("clamps to the -5% .. +12% band", () => {
    expect(estimateAnnualGrowth([{ date: "2020-01-01", value: 100 }, { date: "2025-01-01", value: 1000 }]).rate).toBe(0.12);
    expect(estimateAnnualGrowth([{ date: "2020-01-01", value: 100 }, { date: "2025-01-01", value: 10 }]).rate).toBe(-0.05);
  });
});

describe("averageAnnualCosts", () => {
  const md = (exps: PropertyExpense[], insurance: number | null) => ({
    property_expenses: exps,
    yearly_insurance_fee: insurance,
  });

  it("spreads logged expenses over years held and adds yearly insurance", () => {
    expect(averageAnnualCosts(md([expense("2023-01-01", 3000)], 500), "2022-01-01", "2025-01-01")).toBe(1000 + 500);
  });

  it("uses a minimum holding period of 1 year, and 1 year when purchase date is unknown", () => {
    expect(averageAnnualCosts(md([expense("2025-01-01", 1200)], null), "2024-10-01", "2025-01-01")).toBe(1200);
    expect(averageAnnualCosts(md([expense("2025-01-01", 1200)], null), null, "2025-01-01")).toBe(1200);
  });

  it("is zero with nothing logged", () => {
    expect(averageAnnualCosts(md([], null), "2020-01-01", "2025-01-01")).toBe(0);
  });
});

describe("offplanPaidAt / projectionDates", () => {
  const plan: OffplanPlan = {
    paidNow: 100,
    futureInstallments: [
      { due_date: "2025-06-01", amount: 50 },
      { due_date: "2025-09-01", amount: 25 },
    ],
    handoverDate: "2025-12-15",
  };

  it("offplanPaidAt adds installments due on or before the date", () => {
    expect(offplanPaidAt(plan, "2025-05-31")).toBe(100);
    expect(offplanPaidAt(plan, "2025-06-01")).toBe(150);
    expect(offplanPaidAt(plan, "2030-01-01")).toBe(175);
    expect(offplanPaidAt({ paidNow: 0, futureInstallments: [], handoverDate: null }, "2030-01-01")).toBe(0);
  });

  it("projectionDates is sorted, unique, and spans today to today+years", () => {
    const dates = projectionDates({ today: "2025-01-15", years: 2 });
    expect(dates[0]).toBe("2025-01-15");
    expect(dates[dates.length - 1]).toBe("2027-01-15");
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates).toHaveLength(25);
  });

  it("clamps month-end sampling dates (31 Jan, leap February)", () => {
    const d = projectionDates({ today: "2024-01-31", years: 1 });
    expect(d).toContain("2024-02-29");
    expect(d).toContain("2024-03-31");
    expect(d).toContain("2024-04-30");
    expect(projectionDates({ today: "2025-01-31", years: 1 })).toContain("2025-02-28");
  });

  it("off-plan adds bi-weekly samples to handover plus exact installment/handover days", () => {
    const d = projectionDates({ today: "2025-01-01", years: 2, offplan: plan });
    for (const day of ["2025-06-01", "2025-05-31", "2025-09-01", "2025-08-31", "2025-12-15", "2025-12-14", "2025-01-15", "2025-01-29"]) {
      expect(d).toContain(day);
    }
    const plain = projectionDates({ today: "2025-01-01", years: 2 });
    expect(d.length).toBeGreaterThan(plain.length);
  });

  it("ignores a handover that is not in the future and installments outside the horizon", () => {
    const past: OffplanPlan = { paidNow: 0, futureInstallments: [{ due_date: "2099-01-01", amount: 1 }], handoverDate: "2020-01-01" };
    expect(projectionDates({ today: "2025-01-01", years: 1, offplan: past })).toEqual(
      projectionDates({ today: "2025-01-01", years: 1 }),
    );
  });
});

describe("buildProjection", () => {
  const common = {
    today: "2025-01-01",
    years: 1,
    marketValue: 1_000_000,
    growthRate: 0,
    totalCost: 900_000,
    loan: loan(),
    schedule: [],
    annualRent: 0,
    annualCosts: 0,
    baseCumulativeNetRent: 0,
    hasLoan: false,
  };

  it("starts today at the current figures", () => {
    const [first] = buildProjection(common);
    expect(first).toEqual({
      date: "2025-01-01",
      pValue: 1_000_000,
      pNetEquity: 1_000_000,
      pNetProfit: 100_000,
      pLoanBalance: null,
      pTotalReturn: 100_000,
    });
  });

  it("compounds market value yearly and defaults to a 20 year horizon", () => {
    const pts = buildProjection({ ...common, years: undefined, growthRate: 0.05 });
    const last = pts[pts.length - 1];
    expect(last.date).toBe("2045-01-01");
    expect(last.pValue).toBeCloseTo(1_000_000 * Math.pow(1.05, 20 * (7305 / 7305.0)), -3);
    expect(pts[pts.length - 1].pValue).toBeGreaterThan(pts[1].pValue);
  });

  it("with no loan, net equity equals value and loan balance is null", () => {
    for (const p of buildProjection({ ...common, growthRate: 0.03 })) {
      expect(p.pNetEquity).toBeCloseTo(p.pValue, 6);
      expect(p.pLoanBalance).toBeNull();
    }
  });

  it("subtracts a manual (non-amortizable) loan balance from equity throughout", () => {
    const pts = buildProjection({
      ...common,
      hasLoan: true,
      loan: loan({ outstanding_principal: 400_000, amount: 500_000 }),
    });
    for (const p of pts) {
      expect(p.pLoanBalance).toBe(400_000);
      expect(p.pNetEquity).toBe(p.pValue - 400_000);
    }
  });

  it("falls back to the original amount when no outstanding principal is given", () => {
    const pts = buildProjection({ ...common, hasLoan: true, loan: loan({ amount: 300_000 }) });
    expect(pts[0].pLoanBalance).toBe(300_000);
  });

  it("follows the amortization schedule for an amortizing loan and net equity moves with it", () => {
    const l = loan({ amount: 500_000, interest_rate: 4, duration_months: 240, start_date: "2024-01-01" });
    const schedule = generateAmortizationSchedule(l);
    const pts = buildProjection({ ...common, years: 5, hasLoan: true, loan: l, schedule });
    expect(pts[0].pLoanBalance).toBeCloseTo(getOutstandingPrincipalAt(l, "2025-01-01"), 6);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].pLoanBalance as number).toBeLessThanOrEqual(pts[i - 1].pLoanBalance as number);
    }
    expect(pts[pts.length - 1].pNetEquity).toBeGreaterThan(pts[0].pNetEquity);
  });

  it("accrues net rent pro rata (rent - costs) and carries the base cumulative amount", () => {
    const pts = buildProjection({
      ...common,
      annualRent: 60_000,
      annualCosts: 10_000,
      baseCumulativeNetRent: 5_000,
    });
    const last = pts[pts.length - 1];
    const net = 5_000 + 50_000 * (365 / 365.25);
    expect(last.pTotalReturn).toBeCloseTo(100_000 + net, 4);
  });

  it("deducts schedule interest from cumulative net rent", () => {
    const l = loan({ amount: 500_000, interest_rate: 6, duration_months: 120, start_date: "2024-01-01" });
    const schedule = generateAmortizationSchedule(l);
    const without = buildProjection({ ...common, annualRent: 60_000, hasLoan: true, loan: l, schedule: [] });
    const withInterest = buildProjection({ ...common, annualRent: 60_000, hasLoan: true, loan: l, schedule });
    expect(withInterest[withInterest.length - 1].pTotalReturn).toBeLessThan(without[without.length - 1].pTotalReturn);
  });

  it("off-plan: equity is cash paid until handover (stepping on installment days), then value minus loan", () => {
    const offplan: OffplanPlan = {
      paidNow: 100_000,
      futureInstallments: [{ due_date: "2025-06-01", amount: 50_000 }],
      handoverDate: "2025-10-01",
    };
    const pts = buildProjection({ ...common, marketValue: 400_000, totalCost: 350_000, offplan });
    const at = (d: string) => pts.find((p) => p.date === d);
    expect(at("2025-01-01")?.pNetEquity).toBe(100_000);
    expect(at("2025-05-31")?.pNetEquity).toBe(100_000);
    expect(at("2025-06-01")?.pNetEquity).toBe(150_000);
    expect(at("2025-09-30")?.pNetEquity).toBe(150_000);
    expect(at("2025-10-01")?.pNetEquity).toBe(400_000);
  });

  it("off-plan with no handover date never switches to market-value equity", () => {
    const offplan: OffplanPlan = { paidNow: 10, futureInstallments: [], handoverDate: null };
    const pts = buildProjection({ ...common, offplan });
    expect(pts.every((p) => p.pNetEquity === 10)).toBe(true);
  });

  it("a zero or negative growth rate never produces NaN", () => {
    for (const rate of [0, -0.05]) {
      for (const p of buildProjection({ ...common, growthRate: rate })) {
        expect(Number.isFinite(p.pValue)).toBe(true);
        expect(Number.isFinite(p.pTotalReturn)).toBe(true);
      }
    }
  });
});

describe("estimateOffplanValueAt", () => {
  const input = {
    contractPrice: 1_000,
    startDate: "2024-01-01",
    currentMarketValue: 1_500,
    snapshotDate: "2025-01-01",
  };

  it("is the contract price on or before the start date", () => {
    expect(estimateOffplanValueAt({ ...input, date: "2024-01-01" })).toBe(1_000);
    expect(estimateOffplanValueAt({ ...input, date: "2020-01-01" })).toBe(1_000);
  });

  it("is the current market value on or after the snapshot date", () => {
    expect(estimateOffplanValueAt({ ...input, date: "2025-01-01" })).toBe(1_500);
    expect(estimateOffplanValueAt({ ...input, date: "2030-01-01" })).toBe(1_500);
  });

  it("interpolates linearly in time between the two", () => {
    const mid = estimateOffplanValueAt({ ...input, date: "2024-07-02" });
    expect(mid).toBeGreaterThan(1_240);
    expect(mid).toBeLessThan(1_260);
    // 2024 is a leap year: 366 days total, 183 days elapsed at 2024-07-02 -> exactly half
    expect(mid).toBeCloseTo(1_250, 6);
  });

  it("moves downward when the market value is below the contract price", () => {
    const v = estimateOffplanValueAt({ ...input, currentMarketValue: 800, date: "2024-07-02" });
    expect(v).toBeLessThan(1_000);
    expect(v).toBeGreaterThan(800);
  });

  it("handles a snapshot at or before the start date without dividing by zero", () => {
    const same = estimateOffplanValueAt({ ...input, snapshotDate: "2024-01-01", date: "2024-06-01" });
    expect(same).toBe(1_500);
    expect(Number.isFinite(same)).toBe(true);
  });
});

describe("densifyHistory", () => {
  const pt = (date: string, value: number, extra: Partial<HistoryChartPoint> = {}): HistoryChartPoint => ({
    date,
    value,
    netEquity: value / 2,
    netProfit: value - 50,
    loanBalance: 100 - value / 10,
    totalReturn: value,
    ...extra,
  });

  it("returns the input untouched for fewer than 2 points", () => {
    const one = [pt("2025-01-01", 100)];
    expect(densifyHistory(one)).toBe(one);
    expect(densifyHistory([])).toEqual([]);
  });

  it("creates daily points for histories up to two years and keeps recorded points exact", () => {
    const a = pt("2025-01-01", 100);
    const b = pt("2025-01-11", 200);
    const out = densifyHistory([b, a]);
    expect(out).toHaveLength(11);
    expect(out[0]).toBe(a);
    expect(out[10]).toBe(b);
    expect(out[5].date).toBe("2025-01-06");
    expect(out[5].value).toBeCloseTo(150, 6);
    expect(out[5].netEquity).toBeCloseTo(75, 6);
    expect(out[5].loanBalance).toBeCloseTo(100 - 15, 6);
  });

  it("uses weekly points beyond two years", () => {
    const out = densifyHistory([pt("2020-01-01", 100), pt("2025-01-01", 200)]);
    expect(out[1].date).toBe("2020-01-08");
    expect(out.length).toBeGreaterThan(200);
    expect(out.length).toBeLessThan(300);
    expect(out.map((p) => p.date)).toEqual([...out.map((p) => p.date)].sort());
  });

  it("interpolation across leap day stays monotonic and finite", () => {
    const out = densifyHistory([pt("2024-02-27", 100), pt("2024-03-02", 140)]);
    expect(out.map((p) => p.date)).toEqual(["2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02"]);
    for (let i = 1; i < out.length; i++) expect(out[i].value).toBeGreaterThan(out[i - 1].value);
  });

  it("recomputes derived series through callbacks instead of interpolating", () => {
    const out = densifyHistory([pt("2025-01-01", 100), pt("2025-01-04", 130)], {
      equityAt: (_d, v) => v - 10,
      loanBalanceAt: () => 7,
      netProfitAt: (v) => v - 1,
      totalReturnAt: (_d, v) => v + 1,
    });
    expect(out[1]).toMatchObject({ date: "2025-01-02", value: 110, netEquity: 100, loanBalance: 7, netProfit: 109, totalReturn: 111 });
  });

  it("injects extraDates strictly inside the range (the off-plan installment step)", () => {
    const out = densifyHistory([pt("2024-01-01", 100), pt("2026-06-01", 200)], {
      extraDates: ["2024-03-04", "2024-03-03", "2023-01-01", "2030-01-01", "2024-01-01"],
    });
    const dates = out.map((p) => p.date);
    expect(dates).toContain("2024-03-03");
    expect(dates).toContain("2024-03-04");
    expect(dates).not.toContain("2023-01-01");
    expect(dates).not.toContain("2030-01-01");
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("interpolates null-able series only when both endpoints have values", () => {
    const out = densifyHistory([pt("2025-01-01", 100, { loanBalance: null, totalReturn: null }), pt("2025-01-03", 120)]);
    expect(out[1].loanBalance).toBeNull();
    expect(out[1].totalReturn).toBeNull();
    expect(out[1].netEquity).toBeCloseTo(55, 6);
  });
});
