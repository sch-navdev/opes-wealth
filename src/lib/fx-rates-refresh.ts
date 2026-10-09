import type { SupabaseClient } from "@supabase/supabase-js";
import { currencies } from "@/lib/currencies";
import { FALLBACK_RATES_FROM_USD } from "@/lib/fx";
import { fxCurrencyCodes, gstDate, planDailyRows } from "@/lib/fx-history";
import { isMissingFxTable } from "@/lib/fx-history-server";
import { getFxRates } from "@/lib/services/fx-client";

export type FxRefreshKind = "cron" | "manual";

export type FxRefreshResult =
  | { ok: true; date: string; currencies: number; source: "live" | "fallback"; carried: number; missing: number }
  | { ok: false; errorCode: "table_missing" | "write_failed" | "unexpected"; date: string };

export type FxRefreshDeps = {
  /** Per-USD live table, or null when the provider failed (or is the offline mock: never stored as history). */
  fetchLive?: () => Promise<Record<string, number> | null>;
  now?: () => Date;
};

async function defaultFetchLive(): Promise<Record<string, number> | null> {
  const res = await getFxRates("USD", { bypassCache: true });
  return res.ok && !res.isMock ? res.rates : null;
}

/**
 * Stores today's (GST day) rate for every currency the app handles and logs a run row. Shared by the
 * daily cron and the "Refresh now" action; `db` must be the SERVICE client (writes are service-only).
 * Never throws; returns counts only. A provider failure still writes pegs and carried-forward rows and
 * is logged as `ok=false, error_code=provider_failed` so the indicator turns to "fallback".
 */
export async function runFxRefresh(
  db: SupabaseClient,
  kind: FxRefreshKind,
  deps: FxRefreshDeps = {},
): Promise<FxRefreshResult> {
  const now = (deps.now ?? (() => new Date()))();
  const date = gstDate(now);
  try {
    const codes = fxCurrencyCodes(currencies.map((c) => c.code));
    const live = await (deps.fetchLive ?? defaultFetchLive)();

    const lastKnown: Record<string, number> = {};
    const { data: recent, error: readError } = await db
      .from("fx_rates_daily")
      .select("currency, rate_per_usd")
      .order("rate_date", { ascending: false })
      .limit(codes.length * 4);
    if (readError) return { ok: false, errorCode: isMissingFxTable(readError) ? "table_missing" : "unexpected", date };
    for (const r of recent ?? []) {
      const c = String(r.currency).trim();
      if (!(c in lastKnown)) lastKnown[c] = Number(r.rate_per_usd);
    }

    const plan = planDailyRows({ date, currencies: codes, live, lastKnown, staticFallback: FALLBACK_RATES_FROM_USD });
    const fetchedAt = now.toISOString();
    const { error: writeError } = await db
      .from("fx_rates_daily")
      .upsert(plan.rows.map((r) => ({ ...r, fetched_at: fetchedAt })), { onConflict: "rate_date,currency" });
    const ok = !writeError && live !== null;
    const errorCode = writeError ? "write_failed" : live === null ? "provider_failed" : null;

    await db.from("fx_rate_runs").insert({
      ran_at: fetchedAt,
      kind,
      ok,
      currencies: writeError ? 0 : plan.rows.length,
      source: plan.source,
      error_code: errorCode,
    });
    if (writeError) return { ok: false, errorCode: "write_failed", date };
    return {
      ok: true,
      date,
      currencies: plan.rows.length,
      source: plan.source,
      carried: plan.counts.carried,
      missing: plan.counts.missing,
    };
  } catch {
    return { ok: false, errorCode: "unexpected", date };
  }
}
