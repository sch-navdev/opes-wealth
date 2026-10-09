/**
 * Daily FX history: pure helpers (no imports, no I/O, erasable TypeScript only) so the same file is
 * used by the app, the cron route, the server action and `scripts/backfill-fx-rates.mts`.
 *
 * Storage model (migration 0039, `fx_rates_daily`): one row per (GST calendar day, currency) holding
 * `rate_per_usd` = units of that currency per 1 USD at the midnight-GST fixing (20:00 UTC).
 * A value dated D is converted at the rate of D; a date with no row uses the nearest EARLIER row
 * (carried forward). Pegged currencies are constants and never need a row.
 */

export type FxRateSource = "ecb" | "live" | "peg" | "carried" | "manual";

export type FxRateRow = {
  rate_date: string;
  currency: string;
  rate_per_usd: number;
  source: FxRateSource;
};

/** Units of currency per 1 USD (official pegs; AED/SAR/QAR/BHD/OMR match `USD_PEGS` in fx-history-client.ts). */
export const FX_PEGS_PER_USD: Record<string, number> = {
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  BHD: 0.376,
  OMR: 0.3845,
  JOD: 0.709,
};

/** Day in the Gulf (UTC+4, no DST) a given instant belongs to, as `YYYY-MM-DD`. */
export function gstDate(now: Date | number): string {
  const ms = typeof now === "number" ? now : now.getTime();
  return new Date(ms + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

/** `09 Oct 00:00 GST` style label (fixed UTC+4 offset, English month names; no Intl, so SSR = client). */
export function formatGstStamp(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms + 4 * 3600 * 1000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())} ${months[d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} GST`;
}

/** Codes the app handles: the app's currency list, plus every pegged currency, plus USD; sorted, unique, upper-case. */
export function fxCurrencyCodes(appCodes: readonly string[]): string[] {
  const set = new Set<string>(["USD", ...Object.keys(FX_PEGS_PER_USD)]);
  for (const c of appCodes) if (/^[A-Za-z]{3}$/.test(c)) set.add(c.toUpperCase());
  return [...set].sort();
}

// --- Lookup -----------------------------------------------------------------

type Series = { dates: string[]; rates: number[]; sources: FxRateSource[] };
export type FxRateTable = Map<string, Series>;

/** Index rows per currency, ascending by date (later duplicates of the same date win). */
export function buildRateTable(rows: readonly FxRateRow[]): FxRateTable {
  const grouped = new Map<string, Map<string, FxRateRow>>();
  for (const r of rows) {
    if (!(r.rate_per_usd > 0) || !Number.isFinite(r.rate_per_usd)) continue;
    const cur = r.currency.toUpperCase();
    let byDate = grouped.get(cur);
    if (!byDate) grouped.set(cur, (byDate = new Map()));
    byDate.set(r.rate_date, r);
  }
  const table: FxRateTable = new Map();
  for (const [cur, byDate] of grouped) {
    const sorted = [...byDate.values()].sort((a, b) => (a.rate_date < b.rate_date ? -1 : 1));
    table.set(cur, {
      dates: sorted.map((r) => r.rate_date),
      rates: sorted.map((r) => r.rate_per_usd),
      sources: sorted.map((r) => r.source),
    });
  }
  return table;
}

export type RateLookup = { rate: number; asOf: string; carried: boolean };

/** Rate (per USD) for `currency` on `date`: exact row, else the nearest EARLIER row, else null. USD is 1; pegs are constants. */
export function lookupRate(table: FxRateTable, currency: string, date: string): RateLookup | null {
  const cur = currency.toUpperCase();
  if (cur === "USD") return { rate: 1, asOf: date, carried: false };
  const peg = FX_PEGS_PER_USD[cur];
  if (peg !== undefined) return { rate: peg, asOf: date, carried: false };
  const s = table.get(cur);
  if (!s || s.dates.length === 0) return null;
  let lo = 0;
  let hi = s.dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.dates[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (found < 0) return null;
  return { rate: s.rates[found], asOf: s.dates[found], carried: s.dates[found] !== date || s.sources[found] === "carried" };
}

/**
 * Converts `amount` from `from` to `to` at the rate of `date` (via USD). If either leg has no rate on or
 * before that date, falls back to `fallbackRates` (the current per-USD table, same semantics as
 * `convertAmount`: a currency missing there counts as 1:1), so a missing history never breaks a page.
 */
export function convertOnDate(
  amount: number,
  from: string,
  to: string,
  date: string,
  table: FxRateTable,
  fallbackRates?: Record<string, number>,
): number {
  if (from === to) return amount;
  const f = lookupRate(table, from, date);
  const t = lookupRate(table, to, date);
  if (f && t) return (amount / f.rate) * t.rate;
  const rates = fallbackRates ?? {};
  // Both legs from the same (current) table: never mix a historical leg with a current one.
  const fr = rates[from] ?? 1;
  const tr = rates[to] ?? 1;
  return (amount / fr) * tr;
}

/** True when both legs are covered by history (so `convertOnDate` did not need the fallback). */
export function hasHistoryFor(table: FxRateTable, from: string, to: string, date: string): boolean {
  return from === to || (lookupRate(table, from, date) !== null && lookupRate(table, to, date) !== null);
}

// --- State of the rates --------------------------------------------------------

export type FxState = "fresh" | "stale" | "fallback" | "missing";

export type FxStateConfig = { freshMaxHours: number };
export const FX_STATE_CONFIG: FxStateConfig = { freshMaxHours: 26 };

export type FxLastRun = { ranAt: string; source: string; currencies: number };

/**
 * missing: no history table (migration not applied) or no successful run yet.
 * fallback: the last run had to use the static table (provider unreachable).
 * fresh: last successful run younger than `freshMaxHours` (26 h: daily cron + slack). stale: older.
 */
export function classifyFxState(
  input: { tableAvailable: boolean; lastRun: FxLastRun | null },
  now: Date | number,
  config: FxStateConfig = FX_STATE_CONFIG,
): FxState {
  if (!input.tableAvailable || !input.lastRun) return "missing";
  if (input.lastRun.source === "fallback") return "fallback";
  const ran = Date.parse(input.lastRun.ranAt);
  if (Number.isNaN(ran)) return "missing";
  const nowMs = typeof now === "number" ? now : now.getTime();
  const ageHours = (nowMs - ran) / 3_600_000;
  return ageHours < config.freshMaxHours ? "fresh" : "stale";
}

// --- Daily plan (cron / manual refresh) -----------------------------------------

export type DailyPlan = {
  rows: FxRateRow[];
  counts: { live: number; peg: number; carried: number; missing: number };
  /** `live` when the provider answered, else `fallback`. */
  source: "live" | "fallback";
};

/**
 * Rows to upsert for `date`. Order of preference per currency: constant peg; live rate; last known row;
 * static fallback table (the last two are flagged `carried`); otherwise the currency is skipped.
 * USD is never stored (always 1). `live` is the per-USD table of the provider, or null if it failed.
 */
export function planDailyRows(input: {
  date: string;
  currencies: readonly string[];
  live: Record<string, number> | null;
  lastKnown: Record<string, number>;
  staticFallback: Record<string, number>;
}): DailyPlan {
  const rows: FxRateRow[] = [];
  const counts = { live: 0, peg: 0, carried: 0, missing: 0 };
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  for (const raw of input.currencies) {
    const c = raw.toUpperCase();
    if (c === "USD") continue;
    const push = (rate: number, source: FxRateSource) => rows.push({ rate_date: input.date, currency: c, rate_per_usd: rate, source });
    if (ok(FX_PEGS_PER_USD[c])) {
      push(FX_PEGS_PER_USD[c], "peg");
      counts.peg++;
    } else if (input.live && ok(input.live[c])) {
      push(input.live[c], "live");
      counts.live++;
    } else if (ok(input.lastKnown[c])) {
      push(input.lastKnown[c], "carried");
      counts.carried++;
    } else if (ok(input.staticFallback[c])) {
      push(input.staticFallback[c], "carried");
      counts.carried++;
    } else counts.missing++;
  }
  return { rows, counts, source: input.live ? "live" : "fallback" };
}

// --- Backfill (ECB via Frankfurter, EUR base) ----------------------------------

/** Frankfurter range answer: `{ rates: { "2026-09-28": { USD: 1.17, GBP: 0.86 }, ... } }` (EUR base, working days). */
export type EurSeries = Record<string, Record<string, number>>;

/**
 * Per-USD rows from an EUR-based ECB series. `USD` must be among the symbols. EUR itself is 1/EURUSD;
 * pegged currencies are skipped (constants, see `lookupRate`); currencies the series lacks are reported.
 */
export function deriveRowsFromEurSeries(
  series: EurSeries,
  currencies: readonly string[],
): { rows: FxRateRow[]; unsupported: string[] } {
  const rows: FxRateRow[] = [];
  const unsupported = new Set<string>();
  for (const date of Object.keys(series).sort()) {
    const day = series[date];
    const eurUsd = day?.USD;
    if (!(typeof eurUsd === "number" && eurUsd > 0)) continue;
    for (const raw of currencies) {
      const c = raw.toUpperCase();
      if (c === "USD" || FX_PEGS_PER_USD[c] !== undefined) continue;
      const perEur = c === "EUR" ? 1 : day[c];
      if (!(typeof perEur === "number" && perEur > 0)) {
        unsupported.add(c);
        continue;
      }
      rows.push({ rate_date: date, currency: c, rate_per_usd: perEur / eurUsd, source: "ecb" });
    }
  }
  return { rows, unsupported: [...unsupported].sort() };
}

/** Inclusive `[start, end]` chunks of at most `days` days (ISO dates); empty when start > end. */
export function dateChunks(start: string, end: string, days: number): [string, string][] {
  const out: [string, string][] = [];
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  let cur = start;
  while (cur <= end) {
    const last = addDays(cur, days - 1);
    const stop = last < end ? last : end;
    out.push([cur, stop]);
    cur = addDays(stop, 1);
  }
  return out;
}

// --- What the status indicator shows ---------------------------------------------

export type FxStatusView = {
  state: FxState;
  /** Instant of the last successful run (ISO), null when unknown. */
  ranAt: string | null;
  /** `live`, `fallback` (static table) or the backfill label; empty when unknown. */
  source: string;
  currencies: number;
  /** False while migration 0039 is not applied: history is converted at today's rate (the old behaviour). */
  historyAvailable: boolean;
};

export const FX_STATUS_UNAVAILABLE: FxStatusView = {
  state: "missing",
  ranAt: null,
  source: "",
  currencies: 0,
  historyAvailable: false,
};
