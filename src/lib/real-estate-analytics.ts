/**
 * Pure Real Estate analytics shared by the asset detail view and the history
 * sync: rental-income accounting, the 20-year forward projection, and the
 * off-plan market-value estimate. No React, no I/O.
 */

import {
  canAmortize,
  getOutstandingPrincipalAt,
  type AmortizationScheduleEntry,
} from "@/lib/amortization";
import type {
  LinkedLoan,
  PropertyExpense,
  RealEstateMetadata,
  TenancyContract,
} from "@/lib/real-estate";

// --- Dates ---------------------------------------------------------------

export function monthsBetween(from: string, to: string): number {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  return Math.max(
    0,
    (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth()),
  );
}

export function addYears(isoDate: string, years: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// --- Net rent ------------------------------------------------------------

/**
 * Cumulative rental performance up to `date`, across EVERY tenancy contract
 * (a property is re-let contract after contract), not just the active one:
 *
 * - `rent`: each contract's `annual_rent / 12` for every whole month it was
 *   in force up to `date` (capped at its own end date).
 * - `interest`: loan **interest** charged during those tenancy months. Loan
 *   principal repayments are deliberately NOT a cost here — they build equity,
 *   which Unrealized Gain / Equity already capture. (Subtracting the full
 *   installment, principal included, double-counted it and produced the
 *   large negative Net Profit this replaced.)
 * - `expenses`: every logged property expense dated on or before `date`.
 *
 * `net = rent − interest − expenses`.
 */
export function cumulativeNetRentAt(input: {
  contracts: TenancyContract[];
  schedule: AmortizationScheduleEntry[];
  expenses: PropertyExpense[];
  date: string;
  /** Used per tenancy month when the loan can't be amortized (no schedule): an estimate of its monthly interest. */
  flatMonthlyInterest?: number;
}) {
  const { contracts, schedule, expenses, date } = input;

  const periods = contracts
    .filter((c) => c.start_date && c.start_date <= date)
    .map((c) => {
      const ended = Boolean(c.end_date) && c.end_date < date;
      return {
        start: c.start_date,
        end: ended ? c.end_date : date,
        ended,
        monthlyRent: (c.annual_rent ?? 0) / 12,
      };
    });

  // A finished contract's end date is inclusive (2025-01-01 → 2025-12-31 is
  // 12 months, not 11), so count its days; an ongoing one counts whole
  // calendar months elapsed up to `date`.
  const tenancyMonths = (p: { start: string; end: string; ended: boolean }) =>
    p.ended
      ? Math.round(
          ((new Date(p.end + "T00:00:00Z").getTime() -
            new Date(p.start + "T00:00:00Z").getTime()) /
            86_400_000 +
            1) /
            30.4375,
        )
      : monthsBetween(p.start, p.end);

  const rent = periods.reduce((sum, p) => sum + tenancyMonths(p) * p.monthlyRent, 0);

  const interest =
    schedule.length === 0
      ? periods.reduce(
          (sum, p) => sum + tenancyMonths(p) * (input.flatMonthlyInterest ?? 0),
          0,
        )
      : schedule.reduce((sum, entry) => {
          if (entry.date > date) return sum;
          const inTenancy = periods.some((p) => entry.date > p.start && entry.date <= p.end);
          return inTenancy ? sum + entry.interestAmount : sum;
        }, 0);

  const expenseTotal = expenses.reduce(
    (sum, e) => (e.date && e.date <= date ? sum + (e.amount || 0) : sum),
    0,
  );

  return { rent, interest, expenses: expenseTotal, net: rent - interest - expenseTotal };
}

// --- Growth & forward projection ----------------------------------------

export const DEFAULT_ANNUAL_GROWTH_PERCENT = 3;
const MIN_GROWTH = -0.05;
const MAX_GROWTH = 0.12;
/** Short histories (a few months of mock/refresh points) make a wildly noisy CAGR, so extrapolating 20 years needs at least this much. */
const MIN_HISTORY_YEARS = 2;

/**
 * Annual appreciation implied by the valuation history (CAGR between the
 * earliest and latest point, clamped to a sane band), or the default
 * assumption when there's under 2 years of history or a non-positive
 * starting value. Returned as a fraction (0.03 = 3%/yr).
 */
export function estimateAnnualGrowth(points: { date: string; value: number }[]): {
  rate: number;
  source: "history" | "assumed";
} {
  const fallback = { rate: DEFAULT_ANNUAL_GROWTH_PERCENT / 100, source: "assumed" as const };
  if (points.length < 2) return fallback;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const years =
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365.25 * 86_400_000);
  if (years < MIN_HISTORY_YEARS || !(first.value > 0) || !(last.value > 0)) return fallback;
  const cagr = Math.pow(last.value / first.value, 1 / years) - 1;
  return { rate: Math.min(MAX_GROWTH, Math.max(MIN_GROWTH, cagr)), source: "history" };
}

/** Average yearly running cost: logged expenses spread over the years held (min 1) plus the recurring yearly insurance fee. */
export function averageAnnualCosts(
  metadata: Pick<RealEstateMetadata, "property_expenses" | "yearly_insurance_fee">,
  purchaseDate: string | null,
  today: string,
): number {
  const total = metadata.property_expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const yearsHeld = purchaseDate ? Math.max(1, monthsBetween(purchaseDate, today) / 12) : 1;
  return total / yearsHeld + (metadata.yearly_insurance_fee ?? 0);
}

/**
 * Off-plan payment plan as the projection needs it. There is no handover
 * date field on `RealEstateMetadata`, so `handoverDate` defaults to the last
 * scheduled installment (developers typically collect the final payment at
 * handover); `null` (no schedule at all) means equity simply stays at the
 * amount paid for the whole projection rather than guessing a handover.
 */
export type OffplanPlan = {
  /** Installments already paid today. */
  paidNow: number;
  /** Scheduled installments not yet paid and due after today; assumed paid on their due date. */
  futureInstallments: { due_date: string; amount: number }[];
  handoverDate: string | null;
};

/** Cash paid into an off-plan unit by `date`: what's paid now plus every scheduled installment due by then. */
export function offplanPaidAt(plan: OffplanPlan, date: string): number {
  return (
    plan.paidNow +
    plan.futureInstallments.reduce((sum, m) => (m.due_date <= date ? sum + m.amount : sum), 0)
  );
}

export type ProjectionPoint = {
  date: string;
  pValue: number;
  pNetEquity: number;
  pNetProfit: number;
  pLoanBalance: number | null;
  pTotalReturn: number;
};

/**
 * 20-year (by default) yearly projection starting from today's figures:
 * market value compounds at `growthRate`; the loan follows its amortization
 * schedule (or stays at its manual balance when it can't amortize); each
 * year adds `annualRent − that year's loan interest − averageAnnualCosts` to
 * cumulative net rent (carried forward from `baseCumulativeNetRent`), and
 * Total Return = Unrealized Gain + cumulative net rent. Year 0 is today, so
 * the projection joins the history curve.
 */
export function buildProjection(input: {
  today: string;
  years?: number;
  marketValue: number;
  growthRate: number;
  totalCost: number;
  loan: LinkedLoan;
  schedule: AmortizationScheduleEntry[];
  annualRent: number;
  annualCosts: number;
  baseCumulativeNetRent: number;
  hasLoan: boolean;
  /**
   * Off-plan only. Until handover, Equity is the cash actually paid in
   * (stepping up as scheduled installments fall due) — NOT market value minus
   * a loan, which would read 100% equity on day one because an off-plan unit
   * has no mortgage yet. From handover on it is market value minus the loan.
   */
  offplan?: OffplanPlan;
}): ProjectionPoint[] {
  const years = input.years ?? 20;
  const amortizable = canAmortize(input.loan);
  const manualBalance = input.hasLoan
    ? (input.loan.outstanding_principal ?? input.loan.amount ?? 0)
    : 0;
  const points: ProjectionPoint[] = [];
  let cumulativeNet = input.baseCumulativeNetRent;

  for (let y = 0; y <= years; y++) {
    const date = addYears(input.today, y);
    if (y > 0) {
      const prev = addYears(input.today, y - 1);
      const interest = input.schedule.reduce(
        (s, e) => (e.date > prev && e.date <= date ? s + e.interestAmount : s),
        0,
      );
      cumulativeNet += input.annualRent - interest - input.annualCosts;
    }
    const value = input.marketValue * Math.pow(1 + input.growthRate, y);
    const loanBalance = input.hasLoan
      ? amortizable
        ? getOutstandingPrincipalAt(input.loan, date)
        : manualBalance
      : null;
    const handedOver =
      input.offplan?.handoverDate != null && date >= input.offplan.handoverDate;
    const netEquity = input.offplan
      ? handedOver
        ? value - (loanBalance ?? 0)
        : offplanPaidAt(input.offplan, date)
      : value - (loanBalance ?? 0);
    points.push({
      date,
      pValue: value,
      pNetEquity: netEquity,
      pNetProfit: value - input.totalCost,
      pLoanBalance: loanBalance,
      pTotalReturn: value - input.totalCost + cumulativeNet,
    });
  }
  return points;
}

// --- Off-plan valuation ---------------------------------------------------

/**
 * Estimated market value of an off-plan unit on `date`. An off-plan
 * property's worth is not the installments paid (that is cash invested — the
 * bug this replaces, where the valuation log simply mirrored paid
 * milestones): it is the unit's market value, which starts at the contract
 * price on the purchase/first-milestone date and moves toward the current
 * market valuation by `snapshotDate`, interpolated linearly in time.
 */
export function estimateOffplanValueAt(input: {
  contractPrice: number;
  startDate: string;
  currentMarketValue: number;
  snapshotDate: string;
  date: string;
}): number {
  const { contractPrice, startDate, currentMarketValue, snapshotDate, date } = input;
  if (date <= startDate) return contractPrice;
  if (date >= snapshotDate) return currentMarketValue;
  const span = new Date(snapshotDate).getTime() - new Date(startDate).getTime();
  if (span <= 0) return currentMarketValue;
  const elapsed = new Date(date).getTime() - new Date(startDate).getTime();
  return contractPrice + (currentMarketValue - contractPrice) * (elapsed / span);
}
