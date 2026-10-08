import { attributionFxRequests, type AttributionCandidate, type AttributionFxHistory } from "@/lib/dashboard-attribution";
import { getHistoricalRatesBatch } from "@/lib/services/fx-history-client";

/** Whole-fetch budget: a slow provider must never hold up the dashboard render. */
const FETCH_BUDGET_MS = 6_000;

/**
 * Server-only. One batched historical-FX request per foreign currency, all in
 * parallel, run ONCE per dashboard render. Never throws: any failure (provider
 * down, timeout) just leaves entries out, which lowers the panel's coverage.
 */
export async function fetchAttributionFx(
  candidates: AttributionCandidate[],
  baseCurrency: string,
): Promise<AttributionFxHistory> {
  const requests = attributionFxRequests(candidates);
  const history: AttributionFxHistory = {};
  const work = Promise.all(
    Object.entries(requests).map(async ([currency, dates]) => {
      try {
        const res = await getHistoricalRatesBatch(dates, currency, baseCurrency);
        const byDate: Record<string, number> = {};
        for (const [d, r] of Object.entries(res)) if (r.ok) byDate[d] = r.rate;
        history[currency] = byDate;
      } catch {
        history[currency] = {};
      }
    }),
  ).catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, FETCH_BUDGET_MS);
  });
  try {
    await Promise.race([work, budget]);
  } finally {
    clearTimeout(timer);
  }
  // Snapshot so a late-resolving request cannot mutate what the caller already used.
  return JSON.parse(JSON.stringify(history)) as AttributionFxHistory;
}

/**
 * Server-only. About twelve months of base-per-local FX for each currency, for the panel sparklines: one
 * batched request per currency (the provider answers a date range in one call), all in parallel, under the same
 * time budget. Never throws; a currency that fails is simply left out.
 */
export async function fetchFxTrends(
  currencies: string[],
  baseCurrency: string,
  dates: string[],
): Promise<Record<string, number[]>> {
  const trends: Record<string, number[]> = {};
  if (dates.length < 2) return trends;
  const work = Promise.all(
    currencies.map(async (currency) => {
      try {
        const res = await getHistoricalRatesBatch(dates, currency, baseCurrency);
        const series = dates.flatMap((d) => {
          const r = res[d];
          return r?.ok ? [r.rate] : [];
        });
        if (series.length >= 2) trends[currency] = series;
      } catch {
        /* leave this currency out */
      }
    }),
  ).catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, FETCH_BUDGET_MS);
  });
  try {
    await Promise.race([work, budget]);
  } finally {
    clearTimeout(timer);
  }
  return JSON.parse(JSON.stringify(trends)) as Record<string, number[]>;
}
