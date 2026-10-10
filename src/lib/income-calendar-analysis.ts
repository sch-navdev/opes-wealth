import type { IncomeCalendar } from "@/lib/income-calendar";
import { LIABILITY_KINDS, type LiabilityKind } from "@/lib/income-calendar-liabilities";
import type { PassiveIncomeSource } from "@/lib/passive-income";

/**
 * Numbers behind the full-page income calendar: one row per month (gross split into earned and passive sources,
 * liabilities split by kind, net and the running net), one row per year, and a few plain findings. Pure: no
 * React, no I/O. Net = gross minus the payments due that month; "earned" is switched on or off by the caller.
 */
export type CalendarRow = {
  month: string;
  earned: number;
  passive: number;
  bySource: Record<PassiveIncomeSource, number>;
  gross: number;
  liabilities: number;
  byKind: Record<LiabilityKind, number>;
  net: number;
  /** Net accumulated from the first month of the window up to this one. */
  cumulative: number;
};

export type YearRow = { year: string; gross: number; liabilities: number; net: number; months: number };

export type CalendarAnalysis = {
  rows: CalendarRow[];
  years: YearRow[];
  totals: { gross: number; earned: number; passive: number; liabilities: number; net: number };
  monthlyAverage: { gross: number; liabilities: number; net: number };
  /** Gross income per unit of liabilities; null when nothing is due. */
  coverage: number | null;
  /** Net as a share of gross, percent; null with no gross income. */
  netMarginPct: number | null;
  /** Share of gross that is earned (salary...), percent; null with no gross income. */
  earnedSharePct: number | null;
  negativeMonths: number;
  bestMonth: { month: string; net: number } | null;
  worstMonth: { month: string; net: number } | null;
  /** First month the running net goes below zero, if it does. */
  firstShortfall: string | null;
  topLiability: { kind: LiabilityKind; amount: number; sharePct: number } | null;
  topSource: { source: PassiveIncomeSource | "earned"; amount: number; sharePct: number } | null;
  bySource: Record<PassiveIncomeSource | "earned", number>;
  byKind: Record<LiabilityKind, number>;
};

const SOURCES: PassiveIncomeSource[] = ["rental", "stocks", "reit", "private_equity"];

export function analyseIncomeCalendar(calendar: IncomeCalendar, includeEarned: boolean): CalendarAnalysis {
  let running = 0;
  const rows: CalendarRow[] = calendar.months.map((m) => {
    const earned = includeEarned && m.earned ? m.earned.salary + m.earned.bonus + m.earned.gratuity + m.earned.other : 0;
    const gross = m.total + earned;
    const net = gross - m.liabilityTotal;
    running += net;
    return { month: m.month, earned, passive: m.total, bySource: m.bySource, gross, liabilities: m.liabilityTotal, byKind: m.liabilities, net, cumulative: running };
  });

  const sum = (pick: (r: CalendarRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const totals = { gross: sum((r) => r.gross), earned: sum((r) => r.earned), passive: sum((r) => r.passive), liabilities: sum((r) => r.liabilities), net: sum((r) => r.net) };
  const n = Math.max(1, rows.length);

  const yearMap = new Map<string, YearRow>();
  for (const r of rows) {
    const y = r.month.slice(0, 4);
    const cur = yearMap.get(y) ?? { year: y, gross: 0, liabilities: 0, net: 0, months: 0 };
    cur.gross += r.gross;
    cur.liabilities += r.liabilities;
    cur.net += r.net;
    cur.months += 1;
    yearMap.set(y, cur);
  }

  const bySource = { rental: 0, stocks: 0, reit: 0, private_equity: 0, earned: totals.earned } as CalendarAnalysis["bySource"];
  for (const r of rows) for (const s of SOURCES) bySource[s] += r.bySource[s];
  const byKind = Object.fromEntries(LIABILITY_KINDS.map((k) => [k, rows.reduce((s, r) => s + r.byKind[k], 0)])) as Record<LiabilityKind, number>;

  const sorted = [...rows].sort((a, b) => a.net - b.net);
  const topKind = LIABILITY_KINDS.reduce<LiabilityKind | null>((best, k) => (byKind[k] > (best ? byKind[best] : 0) ? k : best), null);
  const topSrc = (Object.keys(bySource) as (PassiveIncomeSource | "earned")[]).reduce<PassiveIncomeSource | "earned" | null>(
    (best, k) => (bySource[k] > (best ? bySource[best] : 0) ? k : best),
    null,
  );

  return {
    rows,
    years: [...yearMap.values()],
    totals,
    monthlyAverage: { gross: totals.gross / n, liabilities: totals.liabilities / n, net: totals.net / n },
    coverage: totals.liabilities > 0 ? totals.gross / totals.liabilities : null,
    netMarginPct: totals.gross > 0 ? (totals.net / totals.gross) * 100 : null,
    earnedSharePct: totals.gross > 0 ? (totals.earned / totals.gross) * 100 : null,
    negativeMonths: rows.filter((r) => r.net < 0).length,
    bestMonth: rows.length ? { month: sorted[sorted.length - 1].month, net: sorted[sorted.length - 1].net } : null,
    worstMonth: rows.length ? { month: sorted[0].month, net: sorted[0].net } : null,
    firstShortfall: rows.find((r) => r.cumulative < 0)?.month ?? null,
    topLiability: topKind ? { kind: topKind, amount: byKind[topKind], sharePct: (byKind[topKind] / totals.liabilities) * 100 } : null,
    topSource: topSrc ? { source: topSrc, amount: bySource[topSrc], sharePct: (bySource[topSrc] / totals.gross) * 100 } : null,
    bySource,
    byKind,
  };
}
