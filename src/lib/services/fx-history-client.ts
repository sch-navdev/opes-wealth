/**
 * Historical daily FX — server-only, mirrors `fx-client.ts` conventions
 * (`FX_MOCK_MODE`, in-memory cache, never throws, `{ok}` result shape,
 * base-URL env override `FX_HISTORY_API_BASE_URL`).
 *
 * Provider: Frankfurter v1 (ECB reference rates, free, no key), verified live:
 *   single date: GET {base}/v1/YYYY-MM-DD?base=EUR&symbols=USD,GBP
 *     -> {"base":"EUR","date":"2026-10-02","rates":{...}}   (weekend => previous fixing, `date` says which)
 *   range:       GET {base}/v1/START..END?base=EUR&symbols=USD
 *     -> {"rates":{"2026-09-28":{"USD":..},...}}             (working days only)
 *
 * ECB does not publish AED/SAR/QAR/BHD/OMR (USD-pegged): derived as
 * EUR→USD × official peg (units per USD), the same method used for the
 * Porsche value in docs/sql/2026-10-06-fix-porsche-911-values.sql.
 *
 * `rate` is `to` per 1 `from`.
 */

export type HistoricalRateResult =
  | { ok: true; rate: number; asOf: string; source: "ecb" | "peg" | "identity" }
  | { ok: false; reason: string };

/** Units of currency per 1 USD (official pegs). */
export const USD_PEGS: Record<string, number> = {
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  BHD: 0.376,
  OMR: 0.3845,
};

const REQUEST_TIMEOUT_MS = 5_000;
const RANGE_LOOKBACK_DAYS = 10;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MOCK_FROM_EUR: Record<string, number> = {
  EUR: 1, USD: 1.09, GBP: 0.85, CHF: 0.95, JPY: 163, CAD: 1.48, AUD: 1.65, SGD: 1.46,
};

function isMockMode(): boolean {
  return process.env.FX_MOCK_MODE === "true";
}

/** EUR→ccy rate for the requested date: `asOf` is the actual fixing date. */
type EurRate = { asOf: string; rate: number };
const cache = new Map<string, EurRate>(); // key `${requestedDate}|${ccy}`

/** Test helper. */
export function clearFxHistoryCache(): void {
  cache.clear();
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The ECB-published (or EUR/USD) currency needed to price `ccy`. */
function ecbLeg(ccy: string): { ecb: string; peg: number | null } {
  if (ccy in USD_PEGS) return { ecb: "USD", peg: USD_PEGS[ccy] };
  return { ecb: ccy, peg: null };
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function apiBase(): string {
  return process.env.FX_HISTORY_API_BASE_URL ?? "https://api.frankfurter.dev/v1";
}

/** Fills the cache for every (date, ecb currency) pair; throws on failure. */
async function loadEur(dates: string[], ccys: string[]): Promise<void> {
  const missing = ccys.filter((c) => c !== "EUR");
  if (missing.length === 0) return;
  const symbols = missing.join(",");

  if (isMockMode()) {
    for (const d of dates) {
      for (const c of missing) {
        const r = MOCK_FROM_EUR[c];
        if (r === undefined) throw new Error(`No mock rate for ${c}`);
        cache.set(`${d}|${c}`, { asOf: d, rate: r });
      }
    }
    return;
  }

  const sorted = [...dates].sort();
  if (sorted.length === 1) {
    const json = (await getJson(`${apiBase()}/${sorted[0]}?base=EUR&symbols=${symbols}`)) as {
      date?: string;
      rates?: Record<string, number>;
    };
    if (!json?.date || !json.rates) throw new Error("Unexpected provider response");
    for (const c of missing) {
      const r = json.rates[c];
      if (typeof r !== "number" || !(r > 0)) throw new Error(`No rate for ${c}`);
      cache.set(`${sorted[0]}|${c}`, { asOf: json.date, rate: r });
    }
    return;
  }

  const start = addDays(sorted[0], -RANGE_LOOKBACK_DAYS);
  const end = sorted[sorted.length - 1];
  const json = (await getJson(`${apiBase()}/${start}..${end}?base=EUR&symbols=${symbols}`)) as {
    rates?: Record<string, Record<string, number>>;
  };
  if (!json?.rates) throw new Error("Unexpected provider response");
  const series = Object.keys(json.rates).sort();
  for (const d of sorted) {
    // last fixing on or before the requested date
    let pick: string | undefined;
    for (const s of series) if (s <= d) pick = s;
    if (!pick) throw new Error(`No fixing on or before ${d}`);
    for (const c of missing) {
      const r = json.rates[pick][c];
      if (typeof r !== "number" || !(r > 0)) throw new Error(`No rate for ${c}`);
      cache.set(`${d}|${c}`, { asOf: pick, rate: r });
    }
  }
}

function eurPer(date: string, ccy: string): EurRate | null {
  if (ccy === "EUR") return { asOf: date, rate: 1 };
  return cache.get(`${date}|${ccy}`) ?? null;
}

function compose(date: string, from: string, to: string): HistoricalRateResult {
  const f = ecbLeg(from);
  const t = ecbLeg(to);
  const ef = eurPer(date, f.ecb);
  const et = eurPer(date, t.ecb);
  if (!ef || !et) return { ok: false, reason: "Rate unavailable" };
  // ccy per EUR: ecb leg × peg (peg = units per USD)
  const perEurFrom = ef.rate * (f.peg ?? 1);
  const perEurTo = et.rate * (t.peg ?? 1);
  const dates = [f.ecb, t.ecb].filter((c) => c !== "EUR").map((c) => (c === f.ecb ? ef.asOf : et.asOf));
  const asOf = dates.length ? dates.sort()[0] : date;
  return {
    ok: true,
    rate: perEurTo / perEurFrom,
    asOf,
    source: f.peg !== null || t.peg !== null ? "peg" : "ecb",
  };
}

function validate(date: string, from: string, to: string): string | null {
  if (!DATE_RE.test(date)) return "Invalid date (expected YYYY-MM-DD)";
  if (!from || !to) return "Currencies are required";
  return null;
}

export async function getHistoricalRatesBatch(
  dates: string[],
  from: string,
  to: string,
): Promise<Record<string, HistoricalRateResult>> {
  const out: Record<string, HistoricalRateResult> = {};
  try {
    const unique = Array.from(new Set(dates));
    const f = from?.toUpperCase();
    const t = to?.toUpperCase();
    const valid: string[] = [];
    for (const d of unique) {
      const err = validate(d, f, t);
      if (err) out[d] = { ok: false, reason: err };
      else if (f === t) out[d] = { ok: true, rate: 1, asOf: d, source: "identity" };
      else valid.push(d);
    }
    const legs = Array.from(new Set([ecbLeg(f).ecb, ecbLeg(t).ecb]));
    const need = valid.filter((d) => legs.some((c) => c !== "EUR" && !cache.has(`${d}|${c}`)));
    if (need.length > 0) {
      try {
        await loadEur(need, legs);
      } catch (err) {
        const reason =
          err instanceof Error && err.name === "AbortError"
            ? "Historical rate request timed out"
            : `Historical rate unavailable: ${err instanceof Error ? err.message : "unknown error"}`;
        for (const d of need) out[d] = { ok: false, reason };
      }
    }
    for (const d of valid) if (!out[d]) out[d] = compose(d, f, t);
  } catch {
    for (const d of dates) out[d] ??= { ok: false, reason: "Unexpected error" };
  }
  return out;
}

export async function getHistoricalRate(
  date: string,
  from: string,
  to: string,
): Promise<HistoricalRateResult> {
  const res = await getHistoricalRatesBatch([date], from, to);
  return res[date] ?? { ok: false, reason: "Unexpected error" };
}
