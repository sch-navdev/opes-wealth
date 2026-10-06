import type { LinkedLoan } from "@/lib/real-estate";

export type AmortizationScheduleEntry = {
  paymentNumber: number;
  /** ISO date (YYYY-MM-DD) this installment is due, one calendar month after `start_date`, then monthly thereafter. */
  date: string;
  /** Annual rate in effect for this installment, as a percentage (e.g. `3.99`). */
  rateUsed: number;
  paymentAmount: number;
  interestAmount: number;
  principalAmount: number;
  /** Remaining principal immediately after this installment is paid. */
  remainingBalance: number;
};

/** Minimum inputs the reducing-balance engine needs to run at all. Without these, callers must fall back to the manually-entered `outstanding_principal`/`amount`. */
export function canAmortize(loan: LinkedLoan): boolean {
  return !!(
    loan.amount &&
    loan.amount > 0 &&
    loan.duration_months &&
    loan.duration_months > 0 &&
    loan.start_date &&
    loan.interest_rate != null
  );
}

/** The annual rate (percent) in effect for the given 1-indexed payment/month number, under this loan's fixed/hybrid structure. */
export function getRateForMonth(loan: LinkedLoan, monthNumber: number): number {
  const fixedRate = loan.interest_rate ?? 0;
  if (loan.rate_type !== "hybrid") return fixedRate;

  const fixedMonths = loan.fixed_period_months ?? 0;
  if (monthNumber <= fixedMonths) return fixedRate;

  if (!loan.salary_transfer_active) {
    const fallback = loan.fallback_rate ?? fixedRate;
    return Math.max(fallback, loan.floor_rate ?? -Infinity);
  }

  const variable = (loan.reference_rate ?? 0) + (loan.variable_margin ?? 0);
  return Math.max(variable, loan.floor_rate ?? -Infinity);
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Month-end overflow (31 Jan + 1 month) rolls into the next month: clamp back.
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/** Standard level-payment formula for a fully-amortizing loan: the fixed monthly payment that fully retires `principal` over `remainingMonths` at `monthlyRate`. */
function levelPayment(
  principal: number,
  monthlyRate: number,
  remainingMonths: number,
): number {
  if (remainingMonths <= 0) return principal;
  if (monthlyRate === 0) return principal / remainingMonths;
  const factor = Math.pow(1 + monthlyRate, remainingMonths);
  return (principal * monthlyRate * factor) / (factor - 1);
}

/**
 * Generates a full month-by-month reducing-balance amortization schedule.
 * Supports a hybrid rate structure (see `getRateForMonth`): the level
 * payment is recalculated every time the rate changes (recomputed off the
 * remaining balance and remaining term), then held constant until the next
 * rate change — the standard convention for a variable-rate mortgage.
 */
export function generateAmortizationSchedule(
  loan: LinkedLoan,
): AmortizationScheduleEntry[] {
  if (!canAmortize(loan)) return [];

  const totalMonths = loan.duration_months as number;
  const startDate = loan.start_date;
  const entries: AmortizationScheduleEntry[] = [];

  let balance = loan.amount as number;
  let currentPayment = 0;
  let previousRate: number | null = null;

  for (let month = 1; month <= totalMonths && balance > 0.01; month++) {
    const rate = getRateForMonth(loan, month);
    const monthlyRate = rate / 100 / 12;

    if (rate !== previousRate) {
      currentPayment = levelPayment(balance, monthlyRate, totalMonths - month + 1);
      previousRate = rate;
    }

    const interestAmount = balance * monthlyRate;
    let principalAmount = currentPayment - interestAmount;
    let paymentAmount = currentPayment;
    if (principalAmount > balance) {
      principalAmount = balance;
      paymentAmount = principalAmount + interestAmount;
    }
    balance = Math.max(0, balance - principalAmount);

    entries.push({
      paymentNumber: month,
      date: addMonths(startDate, month),
      rateUsed: rate,
      paymentAmount,
      interestAmount,
      principalAmount,
      remainingBalance: balance,
    });
  }

  return entries;
}

/**
 * The exact outstanding principal on a given date, per the amortization
 * schedule, rather than a manually-entered balance. Returns the original
 * principal before `start_date`, `0` once fully repaid, and falls back to
 * `resolveOutstandingLoanBalance`-style manual fields when the loan doesn't
 * have enough data to amortize (see `canAmortize`).
 */
export function getOutstandingPrincipalAt(loan: LinkedLoan, isoDate: string): number {
  if (!canAmortize(loan)) {
    return loan.outstanding_principal ?? loan.amount ?? 0;
  }
  if (isoDate <= loan.start_date) return loan.amount as number;

  const schedule = generateAmortizationSchedule(loan);
  // Before the first installment is due, the full principal is still
  // outstanding — not `0`. Without this, any date between `start_date` and
  // the first entry (e.g. the purchase date itself, if the loan started a
  // few days earlier) fell through the loop below with no entry matching
  // and wrongly returned a balance of 0 (as if the loan were paid off).
  let balance = loan.amount as number;
  for (const entry of schedule) {
    if (entry.date > isoDate) break;
    balance = entry.remainingBalance;
  }
  return balance;
}

export type AmortizationSummary = {
  schedule: AmortizationScheduleEntry[];
  totalPrincipal: number;
  totalInterest: number;
  principalPaidToDate: number;
  interestPaidToDate: number;
  outstandingPrincipal: number;
  percentPaid: number;
};

/** Aggregates the full schedule into the figures the Financing UI needs: pie-chart totals (principal vs. interest) and a paid-vs-remaining progress percentage, as of today. */
export function summarizeAmortization(
  loan: LinkedLoan,
  asOfIsoDate: string = new Date().toISOString().slice(0, 10),
): AmortizationSummary {
  const schedule = generateAmortizationSchedule(loan);
  const totalPrincipal = loan.amount ?? 0;
  const totalInterest = schedule.reduce((sum, e) => sum + e.interestAmount, 0);

  let principalPaidToDate = 0;
  let interestPaidToDate = 0;
  let outstandingPrincipal = totalPrincipal;
  for (const entry of schedule) {
    if (entry.date > asOfIsoDate) break;
    principalPaidToDate += entry.principalAmount;
    interestPaidToDate += entry.interestAmount;
    outstandingPrincipal = entry.remainingBalance;
  }

  const percentPaid = totalPrincipal > 0 ? (principalPaidToDate / totalPrincipal) * 100 : 0;

  return {
    schedule,
    totalPrincipal,
    totalInterest,
    principalPaidToDate,
    interestPaidToDate,
    outstandingPrincipal,
    percentPaid,
  };
}
