import { buildInvestedCapitalSeries, computeHoldingMetrics, tradeCost, type EquityMetadata } from "@/lib/equities";
import { xirr } from "@/lib/irr";
import { isNum, yearsBetween, type DatedValue } from "./common";

export type EquityPerformance = {
  /** Cost basis of the shares still held (average cost). Null with no buy lots. */
  cost: number | null;
  value: number;
  /** value - cost. */
  gain: number | null;
  /** gain / cost as a fraction. */
  gainPct: number | null;
  /** Dividends and other income received (itemised, else the stored total). */
  income: number;
  /** (gain + income) / cost as a fraction. */
  totalReturnPct: number | null;
};

/** Position against its cost, in the holding's own currency. Reuses `computeHoldingMetrics` so it agrees with the brokerage table. */
export function equityPerformance(input: { quantity: number; currentValue: number; metadata: EquityMetadata }): EquityPerformance {
  const m = computeHoldingMetrics(input);
  const gainPct = m.cost != null && m.cost > 0 && m.capitalGain != null ? m.capitalGain / m.cost : null;
  return {
    cost: m.cost,
    value: input.currentValue,
    gain: m.capitalGain,
    gainPct,
    income: m.income,
    totalReturnPct: m.returnPct == null ? null : m.returnPct / 100,
  };
}

export type EquityXirr =
  | { ok: true; rate: number; flows: number }
  | { ok: false; reason: "no_trades" | "mixed_currency" | "no_solution" | "too_short" };

/**
 * Money-weighted return (XIRR) of the position: buys out, sells and income in, and the current value as the
 * terminal inflow on `today` while shares are still held. Annualised, fraction (0.08 = 8 %). Not computed
 * (typed reason, never a guess) when there are no trades, when trades are in another currency than the
 * holding, or when the holding is younger than 30 days (an annualised rate would be meaningless).
 */
export function equityXirr(input: {
  metadata: EquityMetadata;
  currency: string;
  quantity: number;
  currentValue: number;
  today: string;
}): EquityXirr {
  const { metadata, currency, quantity, currentValue, today } = input;
  const trades = metadata.trades.filter((t) => t.quantity > 0 && t.price >= 0 && t.tradeDate);
  if (trades.length === 0) return { ok: false, reason: "no_trades" };
  if (currency && trades.some((t) => t.currency && t.currency !== currency && !(t.bookedAmount && t.bookedAmount > 0))) {
    return { ok: false, reason: "mixed_currency" };
  }
  const flows = trades.map((t) => ({ date: t.tradeDate, amount: (t.side === "buy" ? -1 : 1) * tradeCost(t) }));
  for (const i of metadata.income ?? []) if (i.date && isNum(i.amount) && i.amount !== 0) flows.push({ date: i.date, amount: i.amount });
  if (quantity > 0 && currentValue > 0) flows.push({ date: today, amount: currentValue });
  const first = flows.reduce((m, f) => (f.date < m ? f.date : m), flows[0].date);
  if (yearsBetween(first, today) * 365 < 30) return { ok: false, reason: "too_short" };
  const r = xirr(flows);
  return r.ok ? { ok: true, rate: r.rate, flows: flows.length } : { ok: false, reason: "no_solution" };
}

export type IncomeSummary = {
  total: number;
  trailing12m: number;
  /** trailing 12 months income / current value (fraction), null without value. */
  yieldOnValue: number | null;
  /** trailing 12 months income / cost basis of the open position. */
  yieldOnCost: number | null;
  payments: number;
};

/** Dividend summary from the itemised income ledger; `null` when nothing was recorded. */
export function equityIncome(metadata: EquityMetadata, value: number, cost: number | null, today: string): IncomeSummary | null {
  const rows = (metadata.income ?? []).filter((i) => i.date && isNum(i.amount));
  if (rows.length === 0) return null;
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCFullYear(since.getUTCFullYear() - 1);
  const from = since.toISOString().slice(0, 10);
  const total = rows.reduce((s, i) => s + i.amount, 0);
  const trailing12m = rows.filter((i) => i.date > from && i.date <= today).reduce((s, i) => s + i.amount, 0);
  return {
    total,
    trailing12m,
    yieldOnValue: value > 0 ? trailing12m / value : null,
    yieldOnCost: cost != null && cost > 0 ? trailing12m / cost : null,
    payments: rows.length,
  };
}

/** Unrealised gain through time: each history point minus the cost basis in force on that date. Empty without trades or history. */
export function gainSeries(metadata: EquityMetadata, history: DatedValue[]): DatedValue[] {
  const cost = buildInvestedCapitalSeries(metadata.trades);
  if (cost.length === 0 || history.length === 0) return [];
  const out: DatedValue[] = [];
  for (const h of history) {
    if (h.date < cost[0].date) continue;
    let c = 0;
    for (const p of cost) {
      if (p.date <= h.date) c = p.value;
      else break;
    }
    out.push({ date: h.date, value: h.value - c });
  }
  return out;
}

/** Value (history) next to the cost basis in force (step), one row per history date from the first trade on. */
export function costValueRows(metadata: EquityMetadata, history: DatedValue[]): { date: string; value: number; cost: number }[] {
  const cost = buildInvestedCapitalSeries(metadata.trades);
  if (cost.length === 0) return [];
  const out: { date: string; value: number; cost: number }[] = [];
  for (const h of history) {
    if (h.date < cost[0].date) continue;
    let c = 0;
    for (const p of cost) {
      if (p.date <= h.date) c = p.value;
      else break;
    }
    out.push({ date: h.date, value: h.value, cost: c });
  }
  return out;
}
