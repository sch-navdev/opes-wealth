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
    return { points: [], categories: [] };
  }

  const categories = Array.from(new Set(assets.map((a) => a.category))).sort();

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

  return { points, categories };
}

export { TOTAL_KEY as PORTFOLIO_PERFORMANCE_TOTAL_KEY };
