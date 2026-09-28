/**
 * Portfolio Performance stacked area chart (Phase 2,
 * `tracker/Broker-Trade-Import.md`) — turns each Equities asset's own
 * `asset_history` rows into one merged, stacked time series grouped by
 * exchange (falling back to the ticker when no exchange is set, e.g. for
 * an asset added before this field existed, or a Crypto asset if one is
 * ever included here).
 */

export type EquityHistoryInput = {
  ticker: string;
  exchange: string | null;
  history: { recorded_date: string; value: number }[];
};

export type StackedSeriesPoint = { date: string } & Record<string, number>;

export type StackedPerformanceSeries = {
  points: StackedSeriesPoint[];
  seriesKeys: string[];
};

/**
 * Each equity's history is sparse and on its own schedule (a row only
 * exists for a date it was actually priced/imported), so merging several
 * assets onto one shared date axis means forward-filling: for any date
 * where an asset has no row, it keeps contributing its last known value
 * (0 before its first-ever recorded value) rather than dropping out of the
 * stack and understating the total. This is a real computation over real
 * `asset_history` rows, not synthesized data — the forward-fill is
 * standard practice for merging independently-sampled time series into
 * one stacked chart.
 */
export function buildStackedPerformanceSeries(
  equities: EquityHistoryInput[],
): StackedPerformanceSeries {
  const seriesKeyFor = (e: EquityHistoryInput) => e.exchange || e.ticker;

  const allDates = new Set<string>();
  for (const equity of equities) {
    for (const point of equity.history) {
      allDates.add(point.recorded_date);
    }
  }
  const sortedDates = Array.from(allDates).sort();

  if (sortedDates.length === 0) {
    return { points: [], seriesKeys: [] };
  }

  const seriesKeys = Array.from(new Set(equities.map(seriesKeyFor))).sort();

  const perAssetFilled = equities.map((equity) => {
    const byDate = new Map(equity.history.map((h) => [h.recorded_date, h.value]));
    let lastValue = 0;
    const values = sortedDates.map((date) => {
      const value = byDate.get(date);
      if (value !== undefined) lastValue = value;
      return lastValue;
    });
    return { key: seriesKeyFor(equity), values };
  });

  const points: StackedSeriesPoint[] = sortedDates.map((date, dateIndex) => {
    const point: StackedSeriesPoint = { date } as StackedSeriesPoint;
    for (const key of seriesKeys) point[key] = 0;
    for (const asset of perAssetFilled) {
      point[asset.key] = (point[asset.key] ?? 0) + asset.values[dateIndex];
    }
    return point;
  });

  return { points, seriesKeys };
}
