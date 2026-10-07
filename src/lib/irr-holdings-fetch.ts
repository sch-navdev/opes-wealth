import type { HoldingFxHistory } from "@/lib/irr-holdings";
import { getHistoricalRatesBatch } from "@/lib/services/fx-history-client";

/** Whole-fetch budget: a slow provider must never hold up the page (same idea as the attribution fetch). */
const FETCH_BUDGET_MS = 6_000;

/**
 * Server-only. One batched historical-FX request per foreign currency (`requests` from
 * `collectHoldingFxRequests`), all in parallel. Never throws: any failure (provider down, timeout) just leaves
 * entries out, which turns the affected holdings into `unavailable: "missing_fx"`.
 */
export async function fetchHoldingFx(
  requests: Record<string, string[]>,
  baseCurrency: string,
  budgetMs: number = FETCH_BUDGET_MS,
): Promise<HoldingFxHistory> {
  const history: HoldingFxHistory = {};
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
    timer = setTimeout(resolve, budgetMs);
  });
  try {
    await Promise.race([work, budget]);
  } finally {
    clearTimeout(timer);
  }
  // Snapshot so a late-resolving request cannot mutate what the caller already used.
  return JSON.parse(JSON.stringify(history)) as HoldingFxHistory;
}
