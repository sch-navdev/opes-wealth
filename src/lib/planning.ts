/**
 * Future Projects: the bankability engine (pure, no I/O). A simulated project is an
 * ordinary asset with status 'simulation' plus a `plan` of financing inputs. For each
 * project it works out the cash needed on Day D, the borrowing required, the monthly
 * repayment, and whether a bank would plausibly lend, in the user's base currency.
 *
 * Deliberately simple and transparent. "Bankable" here means three rules a lender
 * applies, NOT a credit decision or advice:
 *   1. LTV: the loan must not exceed the lender's maximum share of the PRICE (fees come
 *      from your own cash).
 *   2. Liquidity: cash on hand (less the cash earlier projects will use) must cover the
 *      cash needed on Day D.
 *   3. Debt ratio: all monthly debt repayments, existing plus new, must stay under the
 *      chosen share of monthly income. Without an income this rule can't be tested.
 */
import { calculateTotalCost, parseRealEstateMetadata, sumAcquisitionFees } from "@/lib/real-estate";
import { parseVehicleMetadata } from "@/lib/vehicles";

export type PlanInputs = {
  /** The day the money is needed (YYYY-MM-DD); "" = not set. */
  day_d: string;
  /** Lender's maximum loan as a percent of the price. */
  ltv_pct: number;
  /** Annual interest rate, percent. */
  rate_pct: number;
  term_years: number;
  /** Own cash put in (base currency). null = the minimum the LTV cap allows. */
  own_cash: number | null;
};

export const DEFAULT_PLAN: PlanInputs = { day_d: "", ltv_pct: 75, rate_pct: 4.5, term_years: 25, own_cash: null };

export function parsePlan(raw: unknown): PlanInputs {
  if (!raw || typeof raw !== "object") return DEFAULT_PLAN;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  return {
    day_d: typeof r.day_d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.day_d) ? r.day_d : "",
    ltv_pct: num(r.ltv_pct, DEFAULT_PLAN.ltv_pct, 0, 100),
    rate_pct: num(r.rate_pct, DEFAULT_PLAN.rate_pct, 0, 40),
    term_years: num(r.term_years, DEFAULT_PLAN.term_years, 1, 50),
    own_cash: typeof r.own_cash === "number" && Number.isFinite(r.own_cash) && r.own_cash >= 0 ? r.own_cash : null,
  };
}

/** Price and fees of a project in its OWN currency. */
export function projectPriceAndFees(
  categoryName: string,
  metadata: unknown,
  currentValue: number,
): { price: number; fees: number } {
  if (categoryName === "Real Estate") {
    const md = parseRealEstateMetadata(metadata);
    const total = calculateTotalCost(md, md.market_valuation ?? currentValue);
    const fees = sumAcquisitionFees(md);
    return { price: Math.max(0, total - fees), fees };
  }
  if (categoryName === "Vehicles") {
    const md = parseVehicleMetadata(metadata);
    return { price: md.purchase_price ?? currentValue, fees: 0 };
  }
  return { price: currentValue, fees: 0 };
}

/** Level monthly repayment of a fully amortising loan. */
export function monthlyPayment(principal: number, annualRatePct: number, termYears: number): number {
  const n = Math.round(termYears * 12);
  if (principal <= 0 || n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  const f = Math.pow(1 + r, n);
  return (principal * r * f) / (f - 1);
}

export type ProjectInput = {
  id: string;
  name: string;
  /** In base currency. */
  price: number;
  fees: number;
  plan: PlanInputs;
};

export type CheckStatus = "pass" | "fail" | "unknown";

export type ProjectResult = {
  id: string;
  name: string;
  dayD: string;
  totalCost: number;
  price: number;
  fees: number;
  /** Own money needed on Day D. */
  cashNeeded: number;
  /** Cash needed at the very least, with the loan at the LTV cap. */
  minCashNeeded: number;
  borrowing: number;
  maxLoan: number;
  ltvActualPct: number;
  monthlyPayment: number;
  /** Cash available on Day D after earlier projects used theirs. */
  cashAvailable: number;
  /** Debt repayments over income after this project, percent; null without an income. */
  debtRatioPct: number | null;
  checks: { ltv: CheckStatus; liquidity: CheckStatus; debtRatio: CheckStatus };
  bankable: boolean;
};

export type PlanningContext = {
  /** Cash and bank balances, base currency. */
  liquidCash: number;
  /** Repayments already due each month, base currency. */
  existingMonthlyDebt: number;
  /** Monthly income entered by the user, base currency; 0 or null = unknown. */
  monthlyIncome: number | null;
  /** Highest acceptable share of income going to debt, percent. */
  maxDebtRatioPct: number;
};

export const DEFAULT_MAX_DEBT_RATIO = 35;

/** Evaluates projects in Day D order, each one seeing the cash and debt the earlier ones use. */
export function evaluateProjects(projects: ProjectInput[], ctx: PlanningContext): ProjectResult[] {
  const ordered = [...projects].sort((a, b) => (a.plan.day_d || "9999").localeCompare(b.plan.day_d || "9999"));
  let cash = ctx.liquidCash;
  let debt = ctx.existingMonthlyDebt;
  const income = ctx.monthlyIncome && ctx.monthlyIncome > 0 ? ctx.monthlyIncome : null;

  return ordered.map((p) => {
    const totalCost = p.price + p.fees;
    const maxLoan = (p.price * p.plan.ltv_pct) / 100;
    const minCashNeeded = Math.max(0, totalCost - maxLoan);
    const ownCash = p.plan.own_cash ?? minCashNeeded;
    const cashNeeded = Math.min(totalCost, Math.max(0, ownCash));
    const borrowing = Math.max(0, totalCost - cashNeeded);
    const payment = monthlyPayment(borrowing, p.plan.rate_pct, p.plan.term_years);

    const cashAvailable = cash;
    debt += payment;
    const debtRatioPct = income ? (debt / income) * 100 : null;

    const checks: ProjectResult["checks"] = {
      ltv: borrowing <= maxLoan + 0.5 ? "pass" : "fail",
      liquidity: cashAvailable + 0.5 >= cashNeeded ? "pass" : "fail",
      debtRatio: debtRatioPct == null ? "unknown" : debtRatioPct <= ctx.maxDebtRatioPct ? "pass" : "fail",
    };
    cash -= cashNeeded;

    return {
      id: p.id,
      name: p.name,
      dayD: p.plan.day_d,
      totalCost,
      price: p.price,
      fees: p.fees,
      cashNeeded,
      minCashNeeded,
      borrowing,
      maxLoan,
      ltvActualPct: p.price > 0 ? (borrowing / p.price) * 100 : 0,
      monthlyPayment: payment,
      cashAvailable,
      debtRatioPct,
      checks,
      bankable: checks.ltv === "pass" && checks.liquidity === "pass" && checks.debtRatio !== "fail",
    };
  });
}

/** Overall verdict over all projects. `incomplete` = nothing failed but income is missing, so affordability is untested. */
export function overallVerdict(results: ProjectResult[]): "none" | "bankable" | "incomplete" | "not_bankable" {
  if (results.length === 0) return "none";
  if (results.some((r) => !r.bankable)) return "not_bankable";
  if (results.some((r) => r.checks.debtRatio === "unknown")) return "incomplete";
  return "bankable";
}
