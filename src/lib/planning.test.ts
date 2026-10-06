import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_DEBT_RATIO,
  DEFAULT_PLAN,
  evaluateProjects,
  monthlyPayment,
  overallVerdict,
  parsePlan,
  projectPriceAndFees,
  type PlanInputs,
  type PlanningContext,
  type ProjectInput,
  type ProjectResult,
} from "@/lib/planning";

describe("monthlyPayment", () => {
  it("matches the textbook level payment (200k, 6%, 20 years = 1432.86)", () => {
    expect(monthlyPayment(200000, 6, 20)).toBeCloseTo(1432.8621, 3);
  });

  it("375k at 4.5% over 25 years", () => {
    expect(monthlyPayment(375000, 4.5, 25)).toBeCloseTo(2084.3718, 3);
  });

  it("0% rate: principal / months", () => {
    expect(monthlyPayment(120000, 0, 10)).toBe(1000);
  });

  it("fractional years are rounded to whole months (2.5y = 30 months)", () => {
    expect(monthlyPayment(120000, 3, 2.5)).toBeCloseTo(4156.8704, 3);
    expect(monthlyPayment(30000, 0, 2.5)).toBe(1000);
  });

  it("0 for a zero/negative principal or a non-positive term", () => {
    expect(monthlyPayment(0, 5, 20)).toBe(0);
    expect(monthlyPayment(-100, 5, 20)).toBe(0);
    expect(monthlyPayment(100000, 5, 0)).toBe(0);
    expect(monthlyPayment(100000, 5, -2)).toBe(0);
  });

  it("repaying over n months always costs at least the principal", () => {
    const p = monthlyPayment(100000, 5, 15);
    expect(p * 180).toBeGreaterThan(100000);
  });

  it("is higher for a higher rate and for a shorter term", () => {
    expect(monthlyPayment(100000, 6, 20)).toBeGreaterThan(monthlyPayment(100000, 4, 20));
    expect(monthlyPayment(100000, 5, 10)).toBeGreaterThan(monthlyPayment(100000, 5, 20));
  });
});

describe("parsePlan", () => {
  it("defaults for null / non-objects", () => {
    expect(parsePlan(null)).toEqual(DEFAULT_PLAN);
    expect(parsePlan(undefined)).toEqual(DEFAULT_PLAN);
    expect(parsePlan("x")).toEqual(DEFAULT_PLAN);
  });

  it("keeps valid values", () => {
    expect(parsePlan({ day_d: "2027-05-01", ltv_pct: 80, rate_pct: 3.2, term_years: 30, own_cash: 50000 })).toEqual({
      day_d: "2027-05-01",
      ltv_pct: 80,
      rate_pct: 3.2,
      term_years: 30,
      own_cash: 50000,
    });
  });

  it("accepts the range boundaries", () => {
    const p = parsePlan({ ltv_pct: 0, rate_pct: 40, term_years: 1, own_cash: 0 });
    expect(p).toMatchObject({ ltv_pct: 0, rate_pct: 40, term_years: 1, own_cash: 0 });
    expect(parsePlan({ ltv_pct: 100, term_years: 50, rate_pct: 0 })).toMatchObject({ ltv_pct: 100, term_years: 50, rate_pct: 0 });
  });

  it("falls back to the default for out-of-range, non-numeric or non-finite numbers", () => {
    const p = parsePlan({ ltv_pct: 101, rate_pct: 41, term_years: 0.5, own_cash: -1 });
    expect(p.ltv_pct).toBe(DEFAULT_PLAN.ltv_pct);
    expect(p.rate_pct).toBe(DEFAULT_PLAN.rate_pct);
    expect(p.term_years).toBe(DEFAULT_PLAN.term_years);
    expect(p.own_cash).toBeNull();
    const q = parsePlan({ ltv_pct: "80", rate_pct: NaN, term_years: Infinity, own_cash: "5000" });
    expect(q.ltv_pct).toBe(DEFAULT_PLAN.ltv_pct);
    expect(q.rate_pct).toBe(DEFAULT_PLAN.rate_pct);
    expect(q.term_years).toBe(DEFAULT_PLAN.term_years);
    expect(q.own_cash).toBeNull();
  });

  it("day_d must be YYYY-MM-DD, else it is cleared", () => {
    expect(parsePlan({ day_d: "2027-5-1" }).day_d).toBe("");
    expect(parsePlan({ day_d: "01/05/2027" }).day_d).toBe("");
    expect(parsePlan({ day_d: 20270501 }).day_d).toBe("");
  });
});

describe("projectPriceAndFees", () => {
  it("Real Estate: price excludes the one-off acquisition fees", () => {
    const r = projectPriceAndFees("Real Estate", { purchasePrice: 500000, agencyFees: 10000, registration_fee_amount: 20000 }, 0);
    expect(r).toEqual({ price: 500000, fees: 30000 });
  });

  it("Real Estate: contract price wins over the purchase price", () => {
    expect(projectPriceAndFees("Real Estate", { contract_price: 600000, purchasePrice: 500000 }, 0).price).toBe(600000);
  });

  it("Real Estate: with no price falls back to the market valuation, then the asset value", () => {
    expect(projectPriceAndFees("Real Estate", { market_valuation: 450000 }, 400000).price).toBe(450000);
    expect(projectPriceAndFees("Real Estate", {}, 400000)).toEqual({ price: 400000, fees: 0 });
    expect(projectPriceAndFees("Real Estate", null, 400000)).toEqual({ price: 400000, fees: 0 });
  });

  it("Real Estate: legacy notary/ADM fees count when no consolidated registration fee exists", () => {
    const r = projectPriceAndFees("Real Estate", { purchasePrice: 100000, notaryFees: 3000, adm_fee_amount: 2000 }, 0);
    expect(r).toEqual({ price: 100000, fees: 5000 });
  });

  it("Vehicles: purchase price, else the asset value; no fees", () => {
    expect(projectPriceAndFees("Vehicles", { purchase_price: 40000 }, 99)).toEqual({ price: 40000, fees: 0 });
    expect(projectPriceAndFees("Vehicles", {}, 25000)).toEqual({ price: 25000, fees: 0 });
  });

  it("any other category: the asset value, no fees", () => {
    expect(projectPriceAndFees("Equities", { anything: 1 }, 7777)).toEqual({ price: 7777, fees: 0 });
  });
});

describe("evaluateProjects", () => {
  const plan = (over: Partial<PlanInputs> = {}): PlanInputs => ({ ...DEFAULT_PLAN, day_d: "2026-01-01", ...over });
  const project = (id: string, price: number, fees: number, planOver: Partial<PlanInputs> = {}): ProjectInput => ({
    id,
    name: `Project ${id}`,
    price,
    fees,
    plan: plan(planOver),
  });
  const ctx = (over: Partial<PlanningContext> = {}): PlanningContext => ({
    liquidCash: 200000,
    existingMonthlyDebt: 0,
    monthlyIncome: 10000,
    maxDebtRatioPct: DEFAULT_MAX_DEBT_RATIO,
    ...over,
  });

  it("no projects, no results", () => {
    expect(evaluateProjects([], ctx())).toEqual([]);
  });

  it("works out cash, loan and repayment at the LTV cap by default", () => {
    const [r] = evaluateProjects([project("a", 500000, 25000)], ctx());
    expect(r.totalCost).toBe(525000);
    expect(r.maxLoan).toBe(375000);
    expect(r.minCashNeeded).toBe(150000);
    expect(r.cashNeeded).toBe(150000);
    expect(r.borrowing).toBe(375000);
    expect(r.ltvActualPct).toBe(75);
    expect(r.monthlyPayment).toBeCloseTo(2084.3718, 3);
    expect(r.cashAvailable).toBe(200000);
    expect(r.debtRatioPct).toBeCloseTo(20.843718, 4);
    expect(r.checks).toEqual({ ltv: "pass", liquidity: "pass", debtRatio: "pass" });
    expect(r.bankable).toBe(true);
    expect(r.dayD).toBe("2026-01-01");
  });

  it("cash + borrowing always equals the total cost", () => {
    for (const own_cash of [null, 0, 100000, 150000, 300000, 10_000_000]) {
      const [r] = evaluateProjects([project("a", 500000, 25000, { own_cash })], ctx());
      expect(r.cashNeeded + r.borrowing).toBeCloseTo(r.totalCost, 6);
    }
  });

  it("more own cash means a smaller loan and payment", () => {
    const [r] = evaluateProjects([project("a", 500000, 25000, { own_cash: 300000 })], ctx());
    expect(r.cashNeeded).toBe(300000);
    expect(r.borrowing).toBe(225000);
    expect(r.monthlyPayment).toBeCloseTo(1250.6231, 3);
  });

  it("own cash beyond the total cost is capped: nothing borrowed, no repayment", () => {
    const [r] = evaluateProjects([project("a", 500000, 25000, { own_cash: 9_000_000 })], ctx({ liquidCash: 10_000_000 }));
    expect(r.cashNeeded).toBe(525000);
    expect(r.borrowing).toBe(0);
    expect(r.monthlyPayment).toBe(0);
  });

  it("own cash below what the LTV cap requires fails the LTV check", () => {
    const [r] = evaluateProjects([project("a", 500000, 25000, { own_cash: 100000 })], ctx());
    expect(r.borrowing).toBe(425000);
    expect(r.checks.ltv).toBe("fail");
    expect(r.bankable).toBe(false);
  });

  it("an LTV overshoot of up to 50 cents is forgiven, more is not", () => {
    // maxLoan = 100000 x 80% = 80000; totalCost 100000; own cash 19999.6 -> borrowing 80000.4
    const ok = evaluateProjects([project("a", 100000, 0, { ltv_pct: 80, own_cash: 19999.6 })], ctx())[0];
    expect(ok.checks.ltv).toBe("pass");
    const bad = evaluateProjects([project("a", 100000, 0, { ltv_pct: 80, own_cash: 19999.4 })], ctx())[0];
    expect(bad.checks.ltv).toBe("fail");
  });

  it("negative own cash is treated as zero", () => {
    const [r] = evaluateProjects([project("a", 100000, 0, { own_cash: -50 })], ctx());
    expect(r.cashNeeded).toBe(0);
    expect(r.borrowing).toBe(100000);
  });

  it("fails liquidity when cash on hand is below the cash needed (50 cent tolerance)", () => {
    const need = 150000;
    expect(evaluateProjects([project("a", 500000, 25000)], ctx({ liquidCash: need - 0.4 }))[0].checks.liquidity).toBe("pass");
    const low = evaluateProjects([project("a", 500000, 25000)], ctx({ liquidCash: need - 0.6 }))[0];
    expect(low.checks.liquidity).toBe("fail");
    expect(low.bankable).toBe(false);
  });

  it("fails the debt ratio when repayments exceed the cap of income, passes at exactly the cap", () => {
    // existing 1000 + new 2084.37 = 3084.37 vs income 10000 -> 30.8%
    const pass = evaluateProjects([project("a", 500000, 25000)], ctx({ existingMonthlyDebt: 1000 }))[0];
    expect(pass.debtRatioPct).toBeCloseTo(30.843718, 4);
    expect(pass.checks.debtRatio).toBe("pass");
    const fail = evaluateProjects([project("a", 500000, 25000)], ctx({ existingMonthlyDebt: 2000 }))[0];
    expect(fail.checks.debtRatio).toBe("fail");
    expect(fail.bankable).toBe(false);
    // Exactly at the cap: income chosen so the ratio is 35.
    const payment = monthlyPayment(375000, 4.5, 25);
    const atCap = evaluateProjects([project("a", 500000, 25000)], ctx({ monthlyIncome: payment / 0.35 }))[0];
    expect(atCap.checks.debtRatio).toBe("pass");
  });

  it("without an income the debt ratio is unknown, and does not by itself block 'bankable'", () => {
    for (const monthlyIncome of [null, 0, -100]) {
      const [r] = evaluateProjects([project("a", 500000, 25000)], ctx({ monthlyIncome }));
      expect(r.debtRatioPct).toBeNull();
      expect(r.checks.debtRatio).toBe("unknown");
      expect(r.bankable).toBe(true);
    }
  });

  it("evaluates in Day D order, each project seeing the cash and debt used by earlier ones", () => {
    const early = project("early", 500000, 25000, { day_d: "2026-01-01" }); // needs 150000
    const late = project("late", 500000, 25000, { day_d: "2027-01-01" }); // needs another 150000
    const [r1, r2] = evaluateProjects([late, early], ctx({ liquidCash: 200000 }));
    expect([r1.id, r2.id]).toEqual(["early", "late"]);
    expect(r1.cashAvailable).toBe(200000);
    expect(r2.cashAvailable).toBe(50000);
    expect(r1.checks.liquidity).toBe("pass");
    expect(r2.checks.liquidity).toBe("fail");
    // Debt accumulates: the second ratio includes both repayments.
    expect(r2.debtRatioPct).toBeCloseTo(((2 * 2084.3717923574827) / 10000) * 100, 6);
  });

  it("projects with no Day D are evaluated last", () => {
    const res = evaluateProjects(
      [project("none", 1000, 0, { day_d: "" }), project("dated", 1000, 0, { day_d: "2030-01-01" })],
      ctx(),
    );
    expect(res.map((r) => r.id)).toEqual(["dated", "none"]);
  });

  it("does not mutate the input array order", () => {
    const input = [project("b", 1000, 0, { day_d: "2030-01-01" }), project("a", 1000, 0, { day_d: "2026-01-01" })];
    evaluateProjects(input, ctx());
    expect(input.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("a zero-priced project doesn't divide by zero", () => {
    const [r] = evaluateProjects([project("z", 0, 0)], ctx());
    expect(r.ltvActualPct).toBe(0);
    expect(r.totalCost).toBe(0);
    expect(r.monthlyPayment).toBe(0);
    expect(r.bankable).toBe(true);
  });

  it("an interest-free loan repays principal / months", () => {
    const [r] = evaluateProjects([project("a", 120000, 0, { ltv_pct: 100, rate_pct: 0, term_years: 10 })], ctx());
    expect(r.monthlyPayment).toBe(1000);
  });

  it("fees are paid from own cash: with a 100% LTV on the price, the fees are still the minimum cash", () => {
    const [r] = evaluateProjects([project("a", 100000, 7000, { ltv_pct: 100 })], ctx());
    expect(r.minCashNeeded).toBe(7000);
    expect(r.cashNeeded).toBe(7000);
    expect(r.borrowing).toBe(100000);
  });
});

describe("overallVerdict", () => {
  const result = (over: Partial<ProjectResult> & { debtRatio?: "pass" | "fail" | "unknown" } = {}): ProjectResult => {
    const { debtRatio = "pass", ...rest } = over;
    return {
      id: "x",
      name: "x",
      dayD: "",
      totalCost: 0,
      price: 0,
      fees: 0,
      cashNeeded: 0,
      minCashNeeded: 0,
      borrowing: 0,
      maxLoan: 0,
      ltvActualPct: 0,
      monthlyPayment: 0,
      cashAvailable: 0,
      debtRatioPct: null,
      checks: { ltv: "pass", liquidity: "pass", debtRatio },
      bankable: true,
      ...rest,
    };
  };

  it("none without projects", () => {
    expect(overallVerdict([])).toBe("none");
  });

  it("bankable when every project passes", () => {
    expect(overallVerdict([result(), result()])).toBe("bankable");
  });

  it("not_bankable as soon as one project is not bankable", () => {
    expect(overallVerdict([result(), result({ bankable: false })])).toBe("not_bankable");
  });

  it("incomplete when nothing failed but the income is missing", () => {
    expect(overallVerdict([result(), result({ debtRatio: "unknown" })])).toBe("incomplete");
  });

  it("a failure beats an incomplete check", () => {
    expect(overallVerdict([result({ debtRatio: "unknown" }), result({ bankable: false })])).toBe("not_bankable");
  });

  it("works end to end with evaluateProjects", () => {
    const projects: ProjectInput[] = [{ id: "a", name: "A", price: 500000, fees: 25000, plan: { ...DEFAULT_PLAN, day_d: "2026-01-01" } }];
    const base: PlanningContext = { liquidCash: 200000, existingMonthlyDebt: 0, monthlyIncome: 10000, maxDebtRatioPct: 35 };
    expect(overallVerdict(evaluateProjects(projects, base))).toBe("bankable");
    expect(overallVerdict(evaluateProjects(projects, { ...base, monthlyIncome: null }))).toBe("incomplete");
    expect(overallVerdict(evaluateProjects(projects, { ...base, liquidCash: 1000 }))).toBe("not_bankable");
  });
});
