/**
 * One-off backfill of `fx_rates_daily` (migration 0039 - apply it first) for the dates BEFORE the daily
 * cron existed, from Frankfurter (ECB reference rates, the same provider the attribution code uses).
 *
 *   node --env-file=.env.local scripts/backfill-fx-rates.mts                      # dry run: reads + fetches, prints counts, writes nothing
 *   node --env-file=.env.local scripts/backfill-fx-rates.mts --yes                # writes the rows
 *   node --env-file=.env.local scripts/backfill-fx-rates.mts --from 2024-01-01    # override the start date
 *
 * Start date = the earliest `asset_history.recorded_date` / `transactions.booked_date` (or --from).
 * End date = the day before the first row the cron already wrote (or yesterday GST), so live rows are
 * never overwritten: existing (date, currency) rows are skipped. Only working-day fixings are stored
 * (source 'ecb'); weekends/holidays are carried forward at read time. Pegged currencies (AED, SAR, QAR,
 * BHD, OMR, JOD) need no rows: the app uses their constant peg. Currencies ECB does not publish (and
 * that are not pegged) are listed and skipped: they keep using today's rate until the daily cron has
 * collected history for them.
 *
 * Safe to re-run (upsert on the primary key, rows inserted with ignoreDuplicates). Needs
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; the key is never printed. Uses Node's
 * built-in TypeScript support, so only erasable syntax is allowed. Run by Steve, never by the app.
 */
import { createClient } from "@supabase/supabase-js";
import { currencies } from "../src/lib/currencies.ts";
import { dateChunks, deriveRowsFromEurSeries, fxCurrencyCodes, gstDate } from "../src/lib/fx-history.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file=.env.local).");

const apply = process.argv.includes("--yes");
const fromIdx = process.argv.indexOf("--from");
const fromArg = fromIdx >= 0 ? process.argv[fromIdx + 1] : undefined;
if (fromArg && !/^\d{4}-\d{2}-\d{2}$/.test(fromArg)) throw new Error("--from expects YYYY-MM-DD");

const API = process.env.FX_HISTORY_API_BASE_URL ?? "https://api.frankfurter.dev/v1";
const CHUNK_DAYS = 60; // Frankfurter groups long ranges by week: stay well under 90 days
const WRITE_BATCH = 500;

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
console.log(`Target project: ${new URL(url).host} (${apply ? "WRITING" : "dry run"})`);

async function minDate(table: string, column: string): Promise<string | null> {
  const { data, error } = await db.from(table).select(column).order(column, { ascending: true }).limit(1);
  if (error) {
    console.log(`  ${table}: ${error.code ?? "error"} (skipped)`);
    return null;
  }
  const row = (data as unknown as Record<string, unknown>[] | null)?.[0];
  return row ? String(row[column]) : null;
}

const probe = await db.from("fx_rates_daily").select("rate_date").order("rate_date", { ascending: true }).limit(1);
if (probe.error) throw new Error(`fx_rates_daily is not readable (${probe.error.code ?? "error"}): apply migration 0039 first.`);

const candidates = [fromArg ?? null, ...(fromArg ? [] : [await minDate("asset_history", "recorded_date"), await minDate("transactions", "booked_date")])].filter(
  (d): d is string => !!d,
);
if (candidates.length === 0) {
  console.log("No history dates found: nothing to backfill.");
  process.exit(0);
}
const start = candidates.sort()[0];
const firstLive = probe.data?.[0]?.rate_date ? String(probe.data[0].rate_date) : null;
const yesterday = gstDate(Date.now() - 24 * 3600 * 1000);
const end = firstLive && firstLive <= yesterday ? new Date(Date.parse(`${firstLive}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : yesterday;
console.log(`Range: ${start} .. ${end}`);
if (start > end) {
  console.log("Nothing to backfill (history starts after the range end).");
  process.exit(0);
}

const codes = fxCurrencyCodes(currencies.map((c) => c.code));

// Which currencies does ECB publish?
const supportedRes = await fetch(`${API}/currencies`);
if (!supportedRes.ok) throw new Error(`Provider currency list failed (HTTP ${supportedRes.status}).`);
const supported = new Set(Object.keys((await supportedRes.json()) as Record<string, string>));
const symbols = codes.filter((c) => c !== "EUR" && supported.has(c));
if (!symbols.includes("USD")) symbols.push("USD");

let fetched = 0;
let planned = 0;
let written = 0;
const unsupportedAll = new Set(codes.filter((c) => c !== "USD" && c !== "EUR" && !supported.has(c)));
for (const [a, b] of dateChunks(start, end, CHUNK_DAYS)) {
  const res = await fetch(`${API}/${a}..${b}?base=EUR&symbols=${symbols.join(",")}`);
  if (!res.ok) throw new Error(`Provider failed for ${a}..${b} (HTTP ${res.status}); re-run to resume (already written rows are skipped).`);
  const json = (await res.json()) as { rates?: Record<string, Record<string, number>> };
  const { rows } = deriveRowsFromEurSeries(json.rates ?? {}, codes);
  fetched += Object.keys(json.rates ?? {}).length;
  planned += rows.length;
  if (apply && rows.length > 0) {
    for (let i = 0; i < rows.length; i += WRITE_BATCH) {
      const slice = rows.slice(i, i + WRITE_BATCH).map((r) => ({ ...r, fetched_at: new Date().toISOString() }));
      // ignoreDuplicates: a row the cron (or an earlier run) already wrote is never overwritten.
      const { error } = await db.from("fx_rates_daily").upsert(slice, { onConflict: "rate_date,currency", ignoreDuplicates: true });
      if (error) throw new Error(`Write failed (${error.code ?? "error"}): ${error.message}`);
      written += slice.length;
    }
  }
  console.log(`  ${a}..${b}: ${Object.keys(json.rates ?? {}).length} fixing day(s), ${rows.length} row(s)`);
}

if (apply) {
  const { error } = await db.from("fx_rate_runs").insert({
    kind: "backfill",
    ok: true,
    currencies: symbols.length,
    source: "ecb",
    error_code: null,
  });
  if (error) console.log(`Run log not written (${error.code ?? "error"}).`);
}

console.log(`Done: ${fetched} fixing day(s), ${planned} row(s) planned${apply ? `, ${written} sent for writing` : " (dry run: nothing written, add --yes)"}.`);
if (unsupportedAll.size > 0) console.log(`Not published by ECB (not backfilled): ${[...unsupportedAll].sort().join(", ")}.`);
console.log("Pegged currencies (AED, SAR, QAR, BHD, OMR, JOD) use their constant peg and need no rows.");
