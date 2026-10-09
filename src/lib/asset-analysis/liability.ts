import type { LiabilityMetadata } from "@/lib/liability";
import { changeOver, isNum, monthsBetween, type Change, type DatedValue } from "./common";

export type LiabilityRow = {
  n: number;
  date: string;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
};

export type LiabilityGap = "no_payment" | "no_rate" | "never_amortises" | "no_balance";

export type LiabilityAnalysis = {
  balance: number;
  /** Remaining amortisation schedule from today at the stated rate and monthly payment (informational projection). */
  schedule: LiabilityRow[];
  gap: LiabilityGap | null;
  monthsLeft: number | null;
  payoffDate: string | null;
  /** Interest still to be paid if the payment stays as stated. */
  interestRemaining: number | null;
  /** interest / (principal + interest) over the remaining payments, fraction. */
  interestShare: number | null;
  /** Interest part of the next payment, fraction of that payment. */
  interestShareNext: number | null;
  /**
   * ESTIMATE of interest paid since the first recorded balance: months elapsed x monthly payment minus the
   * principal repaid (first recorded balance - balance now). Null unless that is plausible (not negative).
   */
  interestPaidEstimate: number | null;
  /** Balance / credit limit for a card, fraction. */
  utilisation: number | null;
  balanceChange: Change | null;
};

const MAX_MONTHS = 600;

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

/**
 * Remaining schedule, interest and payoff of a standalone liability from what the record holds: the balance
 * owed, the annual rate and the monthly payment (the form does not store a start date or term, so the schedule
 * is projected forward from `today`). Pure; informational, not advice.
 */
export function liabilityAnalysis(input: { metadata: LiabilityMetadata; balance: number; history: DatedValue[]; today: string }): LiabilityAnalysis {
  const { metadata, today } = input;
  const balance = isNum(input.balance) && input.balance > 0 ? input.balance : 0;
  const rate = metadata.interest_rate;
  const payment = metadata.monthly_payment;
  const base: LiabilityAnalysis = {
    balance,
    schedule: [],
    gap: null,
    monthsLeft: null,
    payoffDate: null,
    interestRemaining: null,
    interestShare: null,
    interestShareNext: null,
    interestPaidEstimate: null,
    utilisation: isNum(metadata.credit_limit) && metadata.credit_limit > 0 ? balance / metadata.credit_limit : null,
    balanceChange: changeOver(input.history),
  };

  // Interest paid so far (estimate): needs the first recorded balance above today's and a payment.
  const first = input.history[0];
  if (first && isNum(payment) && payment > 0 && first.value > balance) {
    const paid = Math.floor(monthsBetween(first.date, today)) * payment;
    const est = paid - (first.value - balance);
    base.interestPaidEstimate = est >= 0 ? est : null;
  }

  if (!(balance > 0)) return { ...base, gap: "no_balance" };
  if (!isNum(payment) || !(payment > 0)) return { ...base, gap: "no_payment" };
  if (!isNum(rate)) return { ...base, gap: "no_rate" };

  const r = rate / 100 / 12;
  if (payment <= balance * r) return { ...base, gap: "never_amortises" };

  const schedule: LiabilityRow[] = [];
  let bal = balance;
  let totalInterest = 0;
  for (let n = 1; n <= MAX_MONTHS && bal > 0.005; n++) {
    const interest = bal * r;
    const pay = Math.min(payment, bal + interest);
    const principal = pay - interest;
    bal = Math.max(0, bal - principal);
    totalInterest += interest;
    schedule.push({ n, date: addMonths(today, n), payment: pay, interest, principal, balance: bal });
  }
  if (bal > 0.005) return { ...base, gap: "never_amortises" };
  return {
    ...base,
    schedule,
    monthsLeft: schedule.length,
    payoffDate: schedule[schedule.length - 1].date,
    interestRemaining: totalInterest,
    interestShare: totalInterest / (balance + totalInterest),
    interestShareNext: schedule[0].payment > 0 ? schedule[0].interest / schedule[0].payment : null,
  };
}
