import { buildFundLedger, type FundLedger } from "@/lib/pe-liquidity";
import type { PrivateEquityMetadata } from "@/lib/private-equity";
import { isIsoDay } from "./common";

export type JCurvePoint = {
  date: string;
  /** Paid capital calls on that date (positive number). */
  calls: number;
  /** Distributions received on that date. */
  distributions: number;
  /** Cumulative distributions minus cumulative paid calls up to and including that date. */
  cumulative: number;
};

export type UnfundedStep = {
  callId: string;
  date: string;
  amount: number;
  overdue: boolean;
  /** Unfunded commitment still to be called AFTER this call is paid. Null when there is no commitment. */
  remainingAfter: number | null;
};

export type PrivateEquityAnalysis = {
  ledger: FundLedger;
  /** Dated actuals only (paid calls out, distributions in); projected distributions never enter. */
  jCurve: JCurvePoint[];
  /** The deepest the cumulative position went (most negative), null with no points. */
  trough: JCurvePoint | null;
  /** Cumulative position plus the current NAV (what the fund is worth if the NAV were realised), null without points. */
  cumulativeWithNav: number | null;
  /** Paid-in as a fraction of the commitment. */
  calledShare: number | null;
  /** Scheduled pending calls, earliest first. */
  unfunded: UnfundedStep[];
  /** Part of the unfunded commitment with no scheduled call yet. */
  unscheduled: number | null;
};

const callDate = (c: PrivateEquityMetadata["capital_calls"][number]) => (c.paid_date && isIsoDay(c.paid_date) ? c.paid_date : c.due_date);

/**
 * Analysis of one private-equity fund from its dated ledger: the J-curve of cumulative ACTUAL net cash flow,
 * DPI / RVPI / TVPI / net IRR (reusing `buildFundLedger`) and the timeline of the still-unfunded commitment.
 * Pure, informational only.
 */
export function privateEquityAnalysis(md: PrivateEquityMetadata, nav: number, today: string): PrivateEquityAnalysis {
  const ledger = buildFundLedger(md, nav, today);

  const byDate = new Map<string, { calls: number; distributions: number }>();
  for (const c of md.capital_calls) {
    if (c.status !== "paid" || !isIsoDay(callDate(c))) continue;
    const e = byDate.get(callDate(c)) ?? { calls: 0, distributions: 0 };
    e.calls += c.amount;
    byDate.set(callDate(c), e);
  }
  for (const d of md.distributions) {
    if (!isIsoDay(d.date)) continue;
    const e = byDate.get(d.date) ?? { calls: 0, distributions: 0 };
    e.distributions += d.amount;
    byDate.set(d.date, e);
  }
  let cumulative = 0;
  const jCurve = [...byDate.keys()].sort().map((date) => {
    const e = byDate.get(date)!;
    cumulative += e.distributions - e.calls;
    return { date, calls: e.calls, distributions: e.distributions, cumulative };
  });
  const trough = jCurve.reduce<JCurvePoint | null>((m, p) => (m == null || p.cumulative < m.cumulative ? p : m), null);

  const pending = md.capital_calls.filter((c) => c.status === "pending" && isIsoDay(c.due_date) && c.amount > 0).sort((a, b) => a.due_date.localeCompare(b.due_date));
  let remaining = ledger.commitment != null ? ledger.unfunded : null;
  const unfunded: UnfundedStep[] = pending.map((c) => {
    if (remaining != null) remaining = Math.max(0, remaining - c.amount);
    return { callId: c.id, date: c.due_date, amount: c.amount, overdue: c.due_date < today, remainingAfter: remaining };
  });
  const scheduled = pending.reduce((s, c) => s + c.amount, 0);

  return {
    ledger,
    jCurve,
    trough,
    cumulativeWithNav: jCurve.length > 0 ? cumulative + ledger.nav : null,
    calledShare: ledger.commitment != null && ledger.commitment > 0 ? ledger.paidIn / ledger.commitment : null,
    unfunded,
    unscheduled: ledger.commitment != null ? Math.max(0, ledger.unfunded - scheduled) : null,
  };
}
