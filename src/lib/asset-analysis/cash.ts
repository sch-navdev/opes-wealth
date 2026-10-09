import { classifyExpense, lastCompleteMonths, type ExpenseClass } from "@/lib/cash-flow-waterfall";
import { balanceAgeDays, pickBalanceDate } from "@/lib/bank-staleness";
import { isIsoDay, isNum, monthKey, type DatedValue } from "./common";

/** A bank transaction of this account, in the account's own currency (signed: positive = money in). */
export type CashTx = { date: string; amount: number; description: string };

/** Stored rows (numeric columns may arrive as strings) to clean transactions. */
export function toCashTxs(rows: { booked_date: string; amount: number | string; description: string | null }[]): CashTx[] {
  const out: CashTx[] = [];
  for (const r of rows) {
    const amount = Number(r.amount);
    if (isIsoDay(r.booked_date) && Number.isFinite(amount)) out.push({ date: r.booked_date, amount, description: r.description ?? "" });
  }
  return out;
}

export type MonthFlow = { month: string; inflow: number; outflow: number; net: number; count: number };

/** Money in / out / net per calendar month, oldest first, limited to the last `months` months that have data. */
export function monthlyFlows(txs: CashTx[], months = 12): MonthFlow[] {
  const map = new Map<string, MonthFlow>();
  for (const t of txs) {
    const key = monthKey(t.date);
    const m = map.get(key) ?? { month: key, inflow: 0, outflow: 0, net: 0, count: 0 };
    if (t.amount >= 0) m.inflow += t.amount;
    else m.outflow += -t.amount;
    m.net = m.inflow - m.outflow;
    m.count += 1;
    map.set(key, m);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-months);
}

export type SpendRow = { key: string; class: ExpenseClass; total: number; count: number; share: number };
export type SpendSummary = {
  rows: SpendRow[];
  total: number;
  essential: number;
  discretionary: number;
};

/**
 * Spending (outflows only) grouped by merchant, biggest first, each tagged essential / discretionary with the
 * same keyword classifier as the Personal Cash Flow waterfall (`classifyExpense`, no per-merchant overrides here).
 * `limit` merchants are listed; the rest are folded into one row with an empty key.
 */
export function topSpend(txs: CashTx[], limit = 6): SpendSummary | null {
  const byKey = new Map<string, SpendRow>();
  let essential = 0;
  let discretionary = 0;
  for (const t of txs) {
    if (!(t.amount < 0)) continue;
    const c = classifyExpense(t.description);
    const key = c.key || "";
    const row = byKey.get(key) ?? { key, class: c.class, total: 0, count: 0, share: 0 };
    row.total += -t.amount;
    row.count += 1;
    byKey.set(key, row);
    if (c.class === "essential") essential += -t.amount;
    else discretionary += -t.amount;
  }
  const total = essential + discretionary;
  if (!(total > 0)) return null;
  const sorted = [...byKey.values()].sort((a, b) => b.total - a.total);
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  if (rest.length > 0) {
    head.push({
      key: "",
      class: "discretionary",
      total: rest.reduce((s, r) => s + r.total, 0),
      count: rest.reduce((s, r) => s + r.count, 0),
      share: 0,
    });
  }
  return { rows: head.map((r) => ({ ...r, share: r.total / total })), total, essential, discretionary };
}

export type Runway = {
  /** Average monthly outflow over the complete months used. */
  monthlyOutflow: number;
  monthsUsed: number;
  /** Balance / average monthly outflow, in months. */
  months: number;
};

/**
 * How many months the current balance would cover at the recent spending rate: average outflow over the last
 * `lookback` COMPLETE months (months without any transaction are skipped, so a gap in the import does not
 * look like a frugal month). `null` without a positive balance or without outflows in those months.
 */
export function cashRunway(balance: number, txs: CashTx[], asOf: string, lookback = 3): Runway | null {
  if (!isNum(balance) || !(balance > 0)) return null;
  const wanted = new Set(lastCompleteMonths(asOf, lookback));
  const flows = monthlyFlows(txs, 1000).filter((m) => wanted.has(m.month));
  if (flows.length === 0) return null;
  const monthlyOutflow = flows.reduce((s, m) => s + m.outflow, 0) / flows.length;
  if (!(monthlyOutflow > 0)) return null;
  return { monthlyOutflow, monthsUsed: flows.length, months: balance / monthlyOutflow };
}

export type StatementInfo = { lastTransaction: string | null; balanceAsOf: string | null; ageDays: number | null };

/** Newest imported transaction date and the balance's "as of" date (same rule as the stale-balance marker). */
export function statementInfo(txs: CashTx[], history: DatedValue[], today: string): StatementInfo {
  const lastTransaction = txs.reduce<string | null>((m, t) => (m == null || t.date > m ? t.date : m), null);
  const balanceAsOf = pickBalanceDate({ historyDate: history.at(-1)?.date ?? null, transactionDate: lastTransaction });
  return { lastTransaction, balanceAsOf, ageDays: balanceAgeDays(lastTransaction ?? balanceAsOf, today) };
}
