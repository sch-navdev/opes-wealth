/**
 * Dashboard "Portfolio Performance" chart — total Net Worth over time,
 * aggregated across every asset (any category), with a per-category
 * breakdown so the dashboard's filter pills can isolate one asset class.
 *
 * Originally (Phase 2, Broker Trade Import) this only plotted Equities,
 * stacked by exchange/ticker. Overhauled to plot Total Net Worth
 * (Total Assets − Total Liabilities) across the whole portfolio instead —
 * every asset already carries a `net_equity` on each `asset_history` row
 * (for Real Estate, already net of its linked loan/off-plan balance — see
 * `lib/liabilities.ts`; for every other category, equal to `value`), so
 * summing `net_equity` per date is Net Worth without needing to redo any
 * liability math here.
 */

export type AssetHistoryInput = {
  /** The asset's category name (`assets.asset_categories.name`), used to key the per-category series for the dashboard's filter pills. */
  category: string;
  history: { recorded_date: string; value: number; net_equity: number | null }[];
};

export type PerformancePoint = { date: string } & Record<string, number>;

export type PortfolioPerformanceSeries = {
  points: PerformancePoint[];
  /** Distinct category names present across the portfolio's history, for the filter pills — "Total" is always available and isn't included here (it's implicit). */
  categories: string[];
  /** Earliest `recorded_date` among the history rows of assets in each category. Lets the chart start a category's x-axis at its own first row instead of the portfolio-wide start (which would leave a long flat lead-in of zeros). */
  categoryStart: Record<string, string>;
};

const TOTAL_KEY = "total";

/**
 * Each asset's history is sparse and on its own schedule (a row only exists
 * for a date it was actually priced/imported/revalued), so merging many
 * assets onto one shared date axis means forward-filling: for any date where
 * an asset has no row, it keeps contributing its last known net equity (0
 * before its first-ever recorded point, since the asset wasn't part of the
 * portfolio's net worth yet) rather than dropping out and understating the
 * total. Standard practice for merging independently-sampled time series.
 */
export function buildNetWorthSeries(
  assets: AssetHistoryInput[],
  /** ISO date to extend the series to (normally today): each asset keeps its last known value up to it, so the chart runs to the present rather than stopping at the last recorded row. */
  throughDate?: string,
): PortfolioPerformanceSeries {
  const allDates = new Set<string>();
  for (const asset of assets) {
    for (const point of asset.history) {
      allDates.add(point.recorded_date);
    }
  }
  const sortedDates = Array.from(allDates).sort();

  if (sortedDates.length === 0) {
    return { points: [], categories: [], categoryStart: {} };
  }

  const categories = Array.from(new Set(assets.map((a) => a.category))).sort();

  const categoryStart: Record<string, string> = {};
  for (const asset of assets) {
    for (const point of asset.history) {
      const current = categoryStart[asset.category];
      if (!current || point.recorded_date < current) {
        categoryStart[asset.category] = point.recorded_date;
      }
    }
  }

  const perAssetFilled = assets.map((asset) => {
    const byDate = new Map(
      asset.history.map((h) => [h.recorded_date, h.net_equity ?? h.value]),
    );
    let lastValue = 0;
    const values = sortedDates.map((date) => {
      const value = byDate.get(date);
      if (value !== undefined) lastValue = value;
      return lastValue;
    });
    return { category: asset.category, values };
  });

  const points: PerformancePoint[] = sortedDates.map((date, dateIndex) => {
    const point: PerformancePoint = { date } as PerformancePoint;
    point[TOTAL_KEY] = 0;
    for (const category of categories) point[category] = 0;
    for (const asset of perAssetFilled) {
      const value = asset.values[dateIndex];
      point[asset.category] = (point[asset.category] ?? 0) + value;
      point[TOTAL_KEY] += value;
    }
    return point;
  });

  const last = points[points.length - 1];
  if (throughDate && last && last.date < throughDate) {
    points.push({ ...last, date: throughDate } as PerformancePoint);
  }

  return { points, categories, categoryStart };
}

/* -------------------------------------------------------------------------
 * Per-asset lines + forward projection (OW7)
 *
 * The category chart above only knows category totals. The interactive
 * explorer (category dialog, forward-looking toggle) needs every asset's own
 * history, so the dashboard also ships a compact per-asset input and these
 * pure helpers derive any selection from it — Grouped Aggregate (one summed
 * line) or Individual (one line per asset) — in either Historical or
 * Forward-Looking mode.
 * ---------------------------------------------------------------------- */

export type AssetLineInput = {
  id: string;
  name: string;
  /** DB category name, same key as `AssetHistoryInput.category`. */
  category: string;
  /** Contribution to Net Worth today, in the Base Currency (negative for debt). */
  currentValue: number;
  /** `[ISO date, net equity ?? value]` rows in the Base Currency. */
  history: [string, number][];
  /**
   * Cumulative capital put in, as a step function `[date, amount]` in the Base
   * Currency (Equities: cost basis of the open position; Real Estate: cash
   * invested; Vehicles: purchase price + ownership costs). Absent for
   * categories with no cost data.
   */
  invested?: [string, number][];
};

export type LineViewMode = "aggregate" | "individual";
export type TimelineMode = "historical" | "projection" | "combined";
export type ChartRange = "1M" | "6M" | "1Y" | "5Y" | "all";
export const CHART_RANGES: ChartRange[] = ["1M", "6M", "1Y", "5Y", "all"];

export const AGGREGATE_LINE_KEY = "aggregate";

export type LineSeries = {
  /** One entry per plotted line: `key` is the data key in each point. */
  lines: {
    key: string;
    label: string;
    assetId: string | null;
    /** `value` (default) = recorded valuation; `projected` = forward curve; `invested` = cumulative capital put in. */
    kind?: "value" | "projected" | "invested";
    /** Index of the asset among the plotted ones — all lines of one asset share a colour. */
    group?: number;
  }[];
  /** `ts` is epoch ms; line keys hold a value or `null` (asset not yet held). */
  points: ({ date: string; ts: number } & Record<string, number | string | null>)[];
};

const lineKey = (assetId: string) => `a_${assetId}`;

/**
 * Caps an ascending history at `maxPoints` evenly-spaced rows (always keeping
 * the first and last). A brokerage holding can carry a daily price row for
 * years; the explorer charts don't need that density, and every row is
 * serialised into the dashboard payload.
 */
export function thinHistory(
  rows: [string, number][],
  maxPoints: number,
  /** Rows on/after this date are never thinned, so short zoom ranges (1M, 6M) keep daily detail. */
  keepFullFrom?: string,
): [string, number][] {
  const recent = keepFullFrom ? rows.filter(([d]) => d >= keepFullFrom) : [];
  const old = keepFullFrom ? rows.filter(([d]) => d < keepFullFrom) : rows;
  if (old.length <= maxPoints || maxPoints < 2) return [...old, ...recent];
  const out: [string, number][] = [];
  const step = (old.length - 1) / (maxPoints - 1);
  let lastIndex = -1;
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round(i * step);
    if (index !== lastIndex) out.push(old[index]);
    lastIndex = index;
  }
  return [...out, ...recent];
}

function addMonthsIso(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Month overflow (31 Jan + 1 month) rolls into the next month: clamp back.
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * Historical lines for the selected assets, forward-filled onto one shared
 * date axis exactly like `buildNetWorthSeries` (an asset keeps its last known
 * value between its own sparse rows). An individual line is `null` before the
 * asset's first row, so it starts where the asset does; the aggregate line
 * sums contributions (0 before an asset exists), so it matches the category
 * chart for the same assets.
 */
export function buildHistoricalLines(
  assets: AssetLineInput[],
  mode: LineViewMode,
  throughDate: string,
): LineSeries {
  const usable = assets.filter((a) => a.history.length > 0);
  if (usable.length === 0) return { lines: [], points: [] };

  const dateSet = new Set<string>([throughDate]);
  for (const a of usable) for (const [d] of a.history) dateSet.add(d);
  const dates = Array.from(dateSet).sort();

  const perAsset = usable.map((a) => {
    const byDate = new Map(a.history);
    let last: number | null = null;
    const values = dates.map((d) => {
      const v = byDate.get(d);
      if (v !== undefined) last = v;
      return last;
    });
    return { asset: a, values };
  });

  const lines: LineSeries["lines"] =
    mode === "aggregate"
      ? [{ key: AGGREGATE_LINE_KEY, label: "", assetId: null }]
      : usable.map((a) => ({ key: lineKey(a.id), label: a.name, assetId: a.id, group: assets.indexOf(a) }));

  const points = dates.map((date, i) => {
    const point: LineSeries["points"][number] = { date, ts: new Date(date).getTime() };
    if (mode === "aggregate") {
      point[AGGREGATE_LINE_KEY] = perAsset.reduce((sum, p) => sum + (p.values[i] ?? 0), 0);
    } else {
      for (const p of perAsset) point[lineKey(p.asset.id)] = p.values[i];
    }
    return point;
  });

  return { lines, points };
}

/* --- Projection ---------------------------------------------------------- */

/**
 * Fallback annual growth by category when an asset has too little history to
 * extrapolate (or its history is contribution-driven — see `CONTRIBUTION_DRIVEN`).
 * Deliberately modest, illustrative assumptions — NOT forecasts or advice.
 */
const DEFAULT_ANNUAL_GROWTH: Record<string, number> = {
  "Real Estate": 0.04,
  SCPI: 0.04,
  Equities: 0.07,
  Crypto: 0.08,
  "Precious Metals": 0.04,
  "Exotic Assets": 0.03,
  Startups: 0.08,
  Cash: 0.02,
  Vehicles: -0.1,
  "Private Equity": 0.08,
  "Assurance-Vie": 0.03,
  Liabilities: 0,
};

/**
 * Categories whose value history mostly reflects money the owner PUT IN
 * (buying more shares, topping up cash), so a CAGR of that curve would
 * wildly overstate growth: always use the category assumption instead.
 */
const CONTRIBUTION_DRIVEN = new Set(["Equities", "Crypto", "Cash", "Private Equity", "Assurance-Vie"]);

const MIN_HISTORY_YEARS = 0.5;
const MIN_GROWTH = -0.15;
const MAX_GROWTH = 0.1;

export type GrowthEstimate = { rate: number; source: "history" | "assumed" };

/** Annual growth for one asset: its own CAGR when history is long enough and meaningful, else the category assumption. Clamped to a sane band. */
export function estimateAssetGrowth(asset: AssetLineInput, today: string): GrowthEstimate {
  const fallback: GrowthEstimate = {
    rate: DEFAULT_ANNUAL_GROWTH[asset.category] ?? 0.03,
    source: "assumed",
  };
  if (CONTRIBUTION_DRIVEN.has(asset.category)) return fallback;

  const rows = [...asset.history].sort((a, b) => a[0].localeCompare(b[0]));
  const first = rows.find(([, v]) => v > 0);
  const last = rows[rows.length - 1];
  if (!first || !last || last[1] <= 0) return fallback;

  const years =
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${first[0]}T00:00:00Z`).getTime()) /
    (365.25 * 24 * 3600 * 1000);
  if (years < MIN_HISTORY_YEARS) return fallback;

  const cagr = (last[1] / first[1]) ** (1 / years) - 1;
  if (!Number.isFinite(cagr)) return fallback;
  return { rate: Math.min(MAX_GROWTH, Math.max(MIN_GROWTH, cagr)), source: "history" };
}

/**
 * Forward-looking lines: each selected asset compounds from today's value at
 * its own growth rate (`growthOverride`, a fraction, replaces every asset's
 * rate), sampled monthly out to `horizonYears`. The first point is today at
 * the current value so the chart leaves the present without a jump.
 * Aggregate = the per-month sum of the individual projections, so the two view
 * modes always agree.
 *
 * Limits (also surfaced in the UI): constant compounding only — no future
 * deposits, mortgage amortization, rent or fees.
 */
export function buildProjectedLines(
  assets: AssetLineInput[],
  mode: LineViewMode,
  opts: { today: string; horizonYears: number; growthOverride?: number | null },
): LineSeries & { rates: Record<string, GrowthEstimate> } {
  const { today, horizonYears, growthOverride } = opts;
  const usable = assets.filter((a) => a.history.length > 0 || a.currentValue !== 0);
  const rates: Record<string, GrowthEstimate> = {};
  for (const a of usable) {
    rates[a.id] =
      growthOverride != null
        ? { rate: growthOverride, source: "assumed" }
        : estimateAssetGrowth(a, today);
  }

  const months = Math.round(horizonYears * 12);
  const lines: LineSeries["lines"] =
    mode === "aggregate"
      ? [{ key: AGGREGATE_LINE_KEY, label: "", assetId: null }]
      : usable.map((a) => ({
          key: lineKey(a.id),
          label: a.name,
          assetId: a.id,
          group: assets.indexOf(a),
        }));

  const points: LineSeries["points"] = [];
  for (let m = 0; m <= months; m++) {
    const date = m === 0 ? today : addMonthsIso(today, m);
    const point: LineSeries["points"][number] = { date, ts: new Date(date).getTime() };
    let total = 0;
    for (const a of usable) {
      const value = a.currentValue * (1 + rates[a.id].rate) ** (m / 12);
      total += value;
      if (mode === "individual") point[lineKey(a.id)] = value;
    }
    if (mode === "aggregate") point[AGGREGATE_LINE_KEY] = total;
    points.push(point);
  }

  return {
    lines: lines.map((l) => ({ ...l, kind: "projected" as const })),
    points,
    rates,
  };
}

/* --- Range, invested capital, combined view ------------------------------ */

/** Earliest ISO date shown for a range, or `null` for "All". */
export function rangeStartDate(range: ChartRange, today: string): string | null {
  if (range === "all") return null;
  const d = new Date(`${today}T00:00:00Z`);
  if (range === "1M") return addMonthsIso(today, -1);
  else if (range === "6M") return addMonthsIso(today, -6);
  else if (range === "1Y") d.setUTCFullYear(d.getUTCFullYear() - 1);
  else d.setUTCFullYear(d.getUTCFullYear() - 5);
  return d.toISOString().slice(0, 10);
}

/**
 * Last known value of every line at or before `date` (null if the line has no
 * value yet). Rows are sparse and different line kinds sit on different dates,
 * so an anchor point must carry EACH line's own last value — copying just the
 * previous point dropped every line that had no row on that date, which made
 * lines start late, clip, or vanish in narrow/custom ranges.
 */
function valuesAt(series: LineSeries, date: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const line of series.lines) {
    let value: number | null = null;
    for (const p of series.points) {
      if (p.date > date) break;
      const v = p[line.key];
      if (typeof v === "number") value = v;
    }
    out[line.key] = value;
  }
  return out;
}

/**
 * Clips a series to the window [from, to] (either may be null = open). Both
 * edges are anchored with each line's last known value, so a line that has no
 * row inside the window still spans it, and the window edges are exact.
 */
export function clipSeries(
  series: LineSeries,
  from: string | null,
  to: string | null,
): LineSeries {
  if (!from && !to) return series;
  const inside = series.points.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));

  const anchor = (date: string) => ({
    date,
    ts: new Date(date).getTime(),
    ...valuesAt(series, date),
  });
  const first = series.points[0]?.date;
  const last = series.points[series.points.length - 1]?.date;
  if (from && first && first < from && inside[0]?.date !== from && (!to || from <= to)) {
    inside.unshift(anchor(from));
  }
  if (to && last && last > to && inside[inside.length - 1]?.date !== to && (!from || from <= to)) {
    inside.push(anchor(to));
  }
  return { ...series, points: inside };
}

/**
 * Cumulative-capital lines for the assets that have cost data: one line per
 * asset (individual) or their sum (aggregate), stepped and forward-filled like
 * the valuation lines. Individual lines are `null` before the first outlay.
 */
export function buildInvestedLines(
  assets: AssetLineInput[],
  mode: LineViewMode,
  throughDate: string,
): LineSeries {
  const usable = assets.filter((a) => a.invested && a.invested.length > 0);
  if (usable.length === 0) return { lines: [], points: [] };

  const dateSet = new Set<string>([throughDate]);
  for (const a of usable) for (const [d] of a.invested!) dateSet.add(d);
  const dates = Array.from(dateSet).sort();

  const perAsset = usable.map((a) => {
    const byDate = new Map(a.invested!);
    let last: number | null = null;
    return {
      asset: a,
      values: dates.map((d) => {
        const v = byDate.get(d);
        if (v !== undefined) last = v;
        return last;
      }),
    };
  });

  const INVESTED_AGGREGATE_KEY = "invested";
  const lines: LineSeries["lines"] =
    mode === "aggregate"
      ? [{ key: INVESTED_AGGREGATE_KEY, label: "", assetId: null, kind: "invested" }]
      : usable.map((a) => ({
          key: `i_${a.id}`,
          label: a.name,
          assetId: a.id,
          kind: "invested" as const,
          group: assets.indexOf(a),
        }));

  const points = dates.map((date, i) => {
    const point: LineSeries["points"][number] = { date, ts: new Date(date).getTime() };
    if (mode === "aggregate") {
      point[INVESTED_AGGREGATE_KEY] = perAsset.reduce((sum, p) => sum + (p.values[i] ?? 0), 0);
    } else {
      for (const p of perAsset) point[`i_${p.asset.id}`] = p.values[i];
    }
    return point;
  });
  return { lines, points };
}

/** Renames every data key (so a projected line can sit beside its historical twin). */
export function suffixSeriesKeys(series: LineSeries, suffix: string): LineSeries {
  return {
    lines: series.lines.map((l) => ({ ...l, key: `${l.key}${suffix}` })),
    points: series.points.map((p) => {
      const next: LineSeries["points"][number] = { date: p.date, ts: p.ts };
      for (const [k, v] of Object.entries(p)) {
        if (k !== "date" && k !== "ts") next[`${k}${suffix}`] = v;
      }
      return next;
    }),
  };
}

/** Joins series on their timestamps (points sharing a `ts` are merged), ordered by time. */
export function mergeLineSeries(...parts: LineSeries[]): LineSeries {
  const byTs = new Map<number, LineSeries["points"][number]>();
  for (const part of parts) {
    for (const p of part.points) {
      byTs.set(p.ts, { ...(byTs.get(p.ts) ?? { date: p.date, ts: p.ts }), ...p });
    }
  }
  return {
    lines: parts.flatMap((p) => p.lines),
    points: Array.from(byTs.values()).sort((a, b) => a.ts - b.ts),
  };
}

/**
 * Historical + Projection on one axis: the recorded curve (solid) runs to
 * today and the projected curve (dashed, same colour) continues from today.
 * Both are drawn from the same per-asset numbers, so aggregate and individual
 * views stay consistent.
 */
export function combineHistoryAndProjection(
  historical: LineSeries,
  projected: LineSeries,
): LineSeries {
  return mergeLineSeries(historical, suffixSeriesKeys(projected, "__p"));
}

export type ChartWindow = {
  range: ChartRange;
  /** Custom ISO start/end (either may be empty). Any value here overrides the preset range. */
  from: string;
  to: string;
};

export const DEFAULT_CHART_WINDOW: ChartWindow = { range: "all", from: "", to: "" };

export const isCustomWindow = (w: ChartWindow) => w.from !== "" || w.to !== "";

/** Resolved [from, to] bounds (swapped if the user typed them backwards); `null` = open. */
export function windowBounds(
  w: ChartWindow,
  today: string,
): { from: string | null; to: string | null } {
  if (!isCustomWindow(w)) return { from: rangeStartDate(w.range, today), to: null };
  const from = w.from || null;
  const to = w.to || null;
  return from && to && from > to ? { from: to, to: from } : { from, to };
}

export type ChartSeriesOptions = {
  mode: LineViewMode;
  timeline: TimelineMode;
  window: ChartWindow;
  showInvested: boolean;
  today: string;
  horizonYears: number;
  growthOverride: number | null;
  /** Pre-built historical aggregate (the dashboard's full-resolution category series); defaults to `buildHistoricalLines`. */
  historicalOverride?: LineSeries;
};

/** Forward-fills every line across the points of a merged series (lines of different kinds sit on different dates). */
function carryForward(series: LineSeries): LineSeries {
  const last: Record<string, number | null> = {};
  const points = series.points.map((p) => {
    const next = { ...p };
    for (const line of series.lines) {
      const v = p[line.key];
      if (typeof v === "number") last[line.key] = v;
      else if (v === undefined && last[line.key] != null) next[line.key] = last[line.key];
    }
    return next;
  });
  return { ...series, points };
}

/** The one series builder behind every chart: timeline mode × date window × invested overlay. */
export function buildChartSeries(assets: AssetLineInput[], opts: ChartSeriesOptions): LineSeries {
  const { mode, timeline, window, showInvested, today, horizonYears, growthOverride } = opts;
  const { from, to } = windowBounds(window, today);

  const projected =
    timeline === "historical"
      ? null
      : buildProjectedLines(assets, mode, { today, horizonYears, growthOverride });
  if (timeline === "projection" && projected) return projected;

  const historical = opts.historicalOverride ?? buildHistoricalLines(assets, mode, today);
  const invested = showInvested
    ? buildInvestedLines(assets, mode, today)
    : { lines: [], points: [] };
  // Merge, fill the gaps between the two kinds' dates, THEN clip — clipping
  // first would anchor each kind separately and lose lines at the edges.
  const base = carryForward(mergeLineSeries(historical, invested));
  const full = projected ? combineHistoryAndProjection(base, projected) : base;
  return clipSeries(full, from, to);
}

export { TOTAL_KEY as PORTFOLIO_PERFORMANCE_TOTAL_KEY };
export { lineKey as assetLineKey };
