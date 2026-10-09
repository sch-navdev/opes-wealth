import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FX_STATUS_UNAVAILABLE,
  buildRateTable,
  classifyFxState,
  type FxRateRow,
  type FxRateTable,
  type FxStatusView,
} from "@/lib/fx-history";

const PAGE_SIZE = 1000;
const CHUNK = 20;

/** Postgres 42P01 / PostgREST PGRST205: the relation does not exist (migration 0039 not applied). */
export function isMissingFxTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    /relation .*fx_rate.* does not exist|could not find the table .*fx_rate/i.test(e.message ?? "")
  );
}

/**
 * History rows for the given currencies from `fromDate` on (callers pass a few days before the first
 * value to convert, so a weekend start can still carry the last fixing forward). Paged: PostgREST
 * truncates at 1000 rows. Never throws; any failure (including a missing table) returns an empty table,
 * and the caller then converts with today's rates as before.
 */
export async function loadFxRateTable(
  db: SupabaseClient,
  currencies: readonly string[],
  fromDate: string,
): Promise<{ table: FxRateTable; available: boolean }> {
  const codes = [...new Set(currencies.map((c) => c.toUpperCase()).filter((c) => c !== "USD"))];
  if (codes.length === 0) return { table: new Map(), available: true };
  const rows: FxRateRow[] = [];
  try {
    for (let i = 0; i < codes.length; i += CHUNK) {
      const slice = codes.slice(i, i + CHUNK);
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await db
          .from("fx_rates_daily")
          .select("rate_date, currency, rate_per_usd, source")
          .in("currency", slice)
          .gte("rate_date", fromDate)
          .order("rate_date", { ascending: true })
          .order("currency", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) return { table: new Map(), available: false };
        for (const r of data ?? []) {
          rows.push({
            rate_date: String(r.rate_date),
            currency: String(r.currency).trim(),
            rate_per_usd: Number(r.rate_per_usd),
            source: r.source as FxRateRow["source"],
          });
        }
        if (!data || data.length < PAGE_SIZE) break;
      }
    }
  } catch {
    return { table: new Map(), available: false };
  }
  return { table: buildRateTable(rows), available: true };
}

/** Latest cron / manual run (a failed one counts as `fallback`) -> the indicator's view. Never throws; a missing table gives `FX_STATUS_UNAVAILABLE`. */
export async function loadFxStatus(db: SupabaseClient, now: Date = new Date()): Promise<FxStatusView> {
  try {
    const { data, error } = await db
      .from("fx_rate_runs")
      .select("ran_at, source, currencies, ok")
      .neq("kind", "backfill")
      .order("ran_at", { ascending: false })
      .limit(1);
    if (error) return FX_STATUS_UNAVAILABLE;
    const run = data?.[0] as { ran_at: string; source: string; currencies: number; ok: boolean } | undefined;
    if (!run) return { ...FX_STATUS_UNAVAILABLE, historyAvailable: true };
    const lastRun = { ranAt: run.ran_at, source: run.ok ? (run.source ?? "") : "fallback", currencies: Number(run.currencies) || 0 };
    return {
      state: classifyFxState({ tableAvailable: true, lastRun }, now),
      ranAt: lastRun.ranAt,
      source: lastRun.source,
      currencies: lastRun.currencies,
      historyAvailable: true,
    };
  } catch {
    return FX_STATUS_UNAVAILABLE;
  }
}
