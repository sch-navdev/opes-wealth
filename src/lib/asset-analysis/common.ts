/**
 * Shared, pure building blocks of the asset Analysis tab (no I/O, never throws, never NaN).
 * Unknown results are `null`; the UI shows an en dash plus the reason, never 0.
 */

export type DatedValue = { date: string; value: number };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const isIsoDay = (v: unknown): v is string => typeof v === "string" && ISO_DAY.test(v) && !Number.isNaN(Date.parse(v));

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Whole days between two ISO days (negative when `to` is earlier); 0 for an invalid date. */
export function daysBetween(from: string, to: string): number {
  if (!isIsoDay(from) || !isIsoDay(to)) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

/** Elapsed months as a fraction (actual days / 30.4375). */
export function monthsBetween(from: string, to: string): number {
  return daysBetween(from, to) / 30.4375;
}

export function yearsBetween(from: string, to: string): number {
  return daysBetween(from, to) / 365;
}

/** Sorted by date, one value per date (the last one wins), invalid rows dropped. */
export function toSeries(rows: { date: string; value: number }[]): DatedValue[] {
  const byDate = new Map<string, number>();
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (isIsoDay(r.date) && isNum(r.value)) byDate.set(r.date, r.value);
  }
  return [...byDate].map(([date, value]) => ({ date, value }));
}

/** An `asset_history`-shaped list as a clean series. */
export function historyToSeries(history: { recorded_date: string; value: number }[]): DatedValue[] {
  return toSeries(history.map((h) => ({ date: h.recorded_date, value: Number(h.value) })));
}

export type Change = { amount: number; pct: number | null; from: DatedValue; to: DatedValue };

/** First to last observation. `null` below two points. `pct` is null when the first value is not positive. */
export function changeOver(series: DatedValue[]): Change | null {
  if (series.length < 2) return null;
  const from = series[0];
  const to = series[series.length - 1];
  const amount = to.value - from.value;
  return { amount, pct: from.value > 0 ? amount / from.value : null, from, to };
}

export type Drawdown = {
  /** Largest peak-to-trough fall as a NEGATIVE fraction (-0.25 = -25 %). */
  pct: number;
  peak: DatedValue;
  trough: DatedValue;
  /** Fall from the highest value so far to the last point (0 when the last point is the high). */
  current: number;
};

/** Maximum drawdown of a value series; `null` with fewer than two points or no positive peak. */
export function maxDrawdown(series: DatedValue[]): Drawdown | null {
  if (series.length < 2) return null;
  let peak = series[0];
  let worst: { pct: number; peak: DatedValue; trough: DatedValue } | null = null;
  for (const p of series) {
    if (p.value > peak.value) peak = p;
    if (peak.value > 0) {
      const dd = p.value / peak.value - 1;
      if (!worst || dd < worst.pct) worst = { pct: dd, peak, trough: p };
    }
  }
  if (!worst) return null;
  const high = series.reduce((m, p) => Math.max(m, p.value), 0);
  const last = series[series.length - 1].value;
  return { ...worst, current: high > 0 ? last / high - 1 : 0 };
}

/**
 * Annualised volatility of an irregularly sampled series: the sample standard deviation of ln-returns, each
 * divided by the square root of its time step in years. `null` with fewer than 3 positive points or when two
 * points share a date.
 */
export function annualisedVolatility(series: DatedValue[]): number | null {
  const pts = series.filter((p) => p.value > 0);
  if (pts.length < 3) return null;
  const z: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dt = yearsBetween(pts[i - 1].date, pts[i].date);
    if (!(dt > 0)) return null;
    z.push(Math.log(pts[i].value / pts[i - 1].value) / Math.sqrt(dt));
  }
  const mean = z.reduce((s, v) => s + v, 0) / z.length;
  const variance = z.reduce((s, v) => s + (v - mean) ** 2, 0) / (z.length - 1);
  return Math.sqrt(variance);
}

/** Compound annual growth between two values over `years`; `null` for non-positive inputs or under a month. */
export function cagr(first: number, last: number, years: number): number | null {
  if (!(first > 0) || !(last > 0) || !(years >= 1 / 12)) return null;
  return (last / first) ** (1 / years) - 1;
}

/** Share of a total, as a fraction; `null` when the total is not positive. */
export function shareOf(part: number, total: number | null | undefined): number | null {
  return isNum(total) && total > 0 && isNum(part) ? part / total : null;
}

/** Up to `max` evenly spaced points (first and last always kept), for sparklines. */
export function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max || max < 2) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return out;
}

/** "2025-03" for an ISO day. */
export const monthKey = (iso: string): string => iso.slice(0, 7);

/** The AnalysisPortfolio figures the dispatcher may receive from the server (null = unknown). */
export type AnalysisPortfolio = {
  /** Sum of the viewer's non-liability holdings in `currency` (their share of co-owned assets). */
  totalAssets: number;
  /** Same sum for the category of the viewed asset. */
  categoryTotal: number;
  currency: string;
  /** Bank accounts linked to the viewed company (metadata.company_id), amounts in `currency`. */
  linkedAccounts: { id: string; name: string; value: number }[];
};
