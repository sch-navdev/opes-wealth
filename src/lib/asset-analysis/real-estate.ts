import { canAmortize, getOutstandingPrincipalAt } from "@/lib/amortization";
import { calculateTotalCost, resolveOutstandingLoanBalance, type RealEstateMetadata } from "@/lib/real-estate";
import { isNum } from "./common";

export type EquityPoint = {
  date: string;
  /** Market value on that date (the recorded valuation). */
  market: number;
  /** Outstanding loan principal on that date. */
  loan: number;
  /** market - loan. */
  equity: number;
  /** loan / market, fraction. */
  ltv: number | null;
};

export type RealEstateExtras = {
  totalCost: number;
  /** Annual rent of the contracts in force today. Null when none is recorded. */
  annualRent: number | null;
  /** Dated property expenses in the 12 months up to today. */
  expenses12m: number;
  /** Annual rent / all-in cost. */
  grossYieldOnCost: number | null;
  /** (annual rent - last 12 months expenses) / all-in cost. */
  netYieldOnCost: number | null;
  /** Annual rent / market value. */
  yieldOnValue: number | null;
  hasLoan: boolean;
  loanNow: number;
  ltvNow: number | null;
  equityNow: number;
  /** Equity at the first valuation to equity now. Null below two points. */
  equityBuildUp: number | null;
  /** One point per recorded valuation: value, loan balance (amortisation engine), equity and LTV. */
  series: EquityPoint[];
};

function twelveMonthsBefore(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * What the Real Estate analysis adds on top of the existing cards: yield on cost, equity build-up and loan to
 * value through time. Equity per date = recorded market value - loan principal from the amortisation engine
 * (the stored balance when the loan cannot be amortised). Pure; informational only.
 */
export function realEstateExtras(input: {
  metadata: RealEstateMetadata;
  marketValue: number;
  history: { recorded_date: string; value: number }[];
  today: string;
}): RealEstateExtras {
  const { metadata, marketValue, today } = input;
  const loan = metadata.linked_loan;
  const hasLoan = (isNum(loan.amount) && loan.amount > 0) || (isNum(loan.outstanding_principal) && loan.outstanding_principal > 0);
  const totalCost = calculateTotalCost(metadata, marketValue);

  const active = metadata.tenancy_contracts.filter((c) => c.start_date && c.start_date <= today && (!c.end_date || c.end_date >= today) && isNum(c.annual_rent) && c.annual_rent > 0);
  const annualRent = active.length > 0 ? active.reduce((s, c) => s + (c.annual_rent ?? 0), 0) : null;
  const from = twelveMonthsBefore(today);
  const expenses12m = metadata.property_expenses.filter((e) => e.date && e.date > from && e.date <= today).reduce((s, e) => s + (e.amount || 0), 0);

  const loanAt = (date: string): number => {
    if (!hasLoan) return 0;
    return canAmortize(loan) ? getOutstandingPrincipalAt(loan, date) : resolveOutstandingLoanBalance(loan);
  };
  const series: EquityPoint[] = [...input.history]
    .filter((h) => h.recorded_date && isNum(h.value) && h.value > 0)
    .sort((a, b) => a.recorded_date.localeCompare(b.recorded_date))
    .map((h) => {
      const l = loanAt(h.recorded_date);
      return { date: h.recorded_date, market: h.value, loan: l, equity: h.value - l, ltv: l / h.value };
    });

  const loanNow = loanAt(today);
  const equityNow = marketValue - loanNow;
  return {
    totalCost,
    annualRent,
    expenses12m,
    grossYieldOnCost: annualRent != null && totalCost > 0 ? annualRent / totalCost : null,
    netYieldOnCost: annualRent != null && totalCost > 0 ? (annualRent - expenses12m) / totalCost : null,
    yieldOnValue: annualRent != null && marketValue > 0 ? annualRent / marketValue : null,
    hasLoan,
    loanNow,
    ltvNow: hasLoan && marketValue > 0 ? loanNow / marketValue : null,
    equityNow,
    equityBuildUp: series.length >= 2 ? equityNow - series[0].equity : null,
    series,
  };
}
