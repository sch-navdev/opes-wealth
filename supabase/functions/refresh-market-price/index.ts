// Supabase Edge Function: refresh-market-price
//
// Fetches a live unit price for an Equities or Crypto asset.
//
// Unlike `refresh-dari-valuation` (a clearly-marked stub, since ADREC/DARI
// has no confirmed public API), both providers here are real, documented
// public APIs:
//   - Crypto -> CoinGecko's `/simple/price` endpoint. Public, no API key
//     required on the free tier. Always live.
//   - Equities -> Finnhub's `/quote` endpoint. Also public and documented,
//     but requires a free API key. Real fetch logic either way -- if the
//     `FINNHUB_API_KEY` secret isn't set (`supabase secrets set
//     FINNHUB_API_KEY=...`), this returns a clear `provider_not_configured`
//     error rather than silently returning fake data.

interface PriceRequest {
  assetId: string;
  category: "equities" | "crypto";
  /** Equities: the ticker, e.g. "AAPL". */
  symbol?: string;
  /** Crypto: CoinGecko's own coin id, e.g. "bitcoin" -- never a ticker. */
  coingeckoId?: string;
  /** The asset's stored currency, e.g. "USD". */
  currency: string;
  /** Equities: where it trades — a MIC ("XPAR") or the app's display name ("EURONEXT", "NASDAQ"). Picks Finnhub (US) vs Yahoo Finance (elsewhere). */
  exchange?: string;
  /** Equities: ISIN, used to resolve the Yahoo Finance symbol for non-US listings. */
  isin?: string;
  /** `history` returns daily closes since `from` instead of a live quote (equities only, always via Yahoo). */
  mode?: "quote" | "history";
  /** History mode: first date wanted, `YYYY-MM-DD`. */
  from?: string;
}

interface PriceSuccess {
  unitPrice: number;
  currency: string;
  asOf: string;
  source: "coingecko" | "finnhub" | "yahoo";
  /** Equities only (Finnhub /quote + /stock/profile2). */
  openPrice?: number;
  previousClose?: number;
  dayChangePct?: number;
  /** Raw exchange string from Finnhub's company profile, e.g. "NASDAQ NMS - GLOBAL MARKET". */
  exchange?: string;
}

type PriceErrorCode =
  | "invalid_request"
  | "invalid_symbol"
  | "unsupported_currency"
  | "provider_not_configured"
  | "invalid_api_key"
  | "no_data"
  | "timeout"
  | "rate_limited"
  | "invalid_response"
  | "network_error";

interface PriceError {
  error: { code: PriceErrorCode; message: string };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REQUEST_TIMEOUT_MS = 8000;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(code: PriceErrorCode, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } } satisfies PriceError, status);
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * CoinGecko's `/simple/price` -- real call, no API key needed. An unknown
 * `coingeckoId` returns HTTP 200 with an empty `{}` body (not a 404), so
 * that has to be checked explicitly rather than relying on response status.
 */
async function fetchCryptoPrice(
  coingeckoId: string,
  currency: string,
): Promise<PriceSuccess | Response> {
  const vsCurrency = currency.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coingeckoId)}&vs_currencies=${encodeURIComponent(vsCurrency)}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return errorResponse("timeout", "CoinGecko took too long to respond.", 504);
    }
    return errorResponse("network_error", "Could not reach CoinGecko.", 502);
  }

  if (res.status === 429) {
    return errorResponse("rate_limited", "CoinGecko's rate limit was hit. Try again shortly.", 429);
  }
  if (!res.ok) {
    return errorResponse("network_error", `CoinGecko returned HTTP ${res.status}.`, 502);
  }

  let body: Record<string, Record<string, number>>;
  try {
    body = await res.json();
  } catch {
    return errorResponse("invalid_response", "CoinGecko returned a malformed response.", 502);
  }

  const price = body[coingeckoId]?.[vsCurrency];
  if (typeof price !== "number") {
    // Either the coin id doesn't exist on CoinGecko, or it exists but
    // doesn't have a quote in the requested currency -- both surface the
    // same way (missing key), so both are reported as "couldn't price this."
    return errorResponse(
      "invalid_symbol",
      `CoinGecko has no ${vsCurrency.toUpperCase()} price for coin id "${coingeckoId}". Check the id (e.g. "bitcoin", not "BTC") and that the currency is supported.`,
      404,
    );
  }

  return {
    unitPrice: price,
    currency: currency.toUpperCase(),
    asOf: new Date().toISOString(),
    source: "coingecko",
  };
}

/**
 * Finnhub's `/quote` -- real call, gated on a real API key. An unrecognized
 * ticker returns HTTP 200 with every field zeroed (`c/h/l/o/pc/t` all 0),
 * not an error status, so that has to be detected explicitly -- otherwise
 * a bad ticker would silently zero out the asset's real value.
 */
async function fetchEquityPrice(
  symbol: string,
  currency: string,
): Promise<PriceSuccess | Response> {
  const apiKey = Deno.env.get("FINNHUB_API_KEY");
  if (!apiKey) {
    return errorResponse(
      "provider_not_configured",
      "Equities live pricing isn't configured yet -- set the FINNHUB_API_KEY secret (supabase secrets set FINNHUB_API_KEY=...) with a free key from finnhub.io.",
      503,
    );
  }

  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(url);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return errorResponse("timeout", "Finnhub took too long to respond.", 504);
    }
    return errorResponse("network_error", "Could not reach Finnhub.", 502);
  }

  // Finnhub answers 401 for a missing/invalid/revoked token. Surface it as
  // its own code (not a generic network error) so the UI can tell the user
  // to fix the key instead of retrying. Returned as 502 — this function's own
  // caller auth succeeded, it's the upstream provider that rejected us.
  if (res.status === 401) {
    return errorResponse(
      "invalid_api_key",
      "Finnhub rejected the API key (HTTP 401) — the FINNHUB_API_KEY secret is invalid, revoked or missing.",
      502,
    );
  }
  if (res.status === 429) {
    return errorResponse("rate_limited", "Finnhub's rate limit was hit. Try again shortly.", 429);
  }
  // 403 = the free tier doesn't cover this listing (non-US exchanges such as
  // EURONEXT). That is a coverage limit, not a failure: report `no_data` so
  // callers can keep the last known price quietly instead of raising a red
  // "failed" banner.
  if (res.status === 403) {
    return errorResponse(
      "no_data",
      `Finnhub's free tier has no quote for "${symbol}" (non-US listings need a paid plan).`,
      404,
    );
  }
  if (!res.ok) {
    return errorResponse("network_error", `Finnhub returned HTTP ${res.status}.`, 502);
  }

  let body: {
    c?: number;
    h?: number;
    l?: number;
    o?: number;
    pc?: number;
    dp?: number;
    t?: number;
  };
  try {
    body = await res.json();
  } catch {
    return errorResponse("invalid_response", "Finnhub returned a malformed response.", 502);
  }

  const allZero =
    !body.c && !body.h && !body.l && !body.o && !body.pc && !body.t;
  // An all-zero quote means "no data" (unknown ticker or not covered by the
  // free tier) — same quiet `no_data` outcome as the 403 above.
  if (allZero || typeof body.c !== "number") {
    return errorResponse(
      "no_data",
      `Finnhub has no quote for ticker "${symbol}" -- it may not exist or isn't covered by the free tier.`,
      404,
    );
  }

  // Company profile (best effort) supplies the listing's exchange and
  // trading currency; if it's unavailable we can only vouch for USD, since
  // /quote itself carries no currency.
  let profile: { exchange?: string; currency?: string } = {};
  try {
    const profileRes = await fetchWithTimeout(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
    );
    if (profileRes.ok) profile = await profileRes.json();
  } catch {
    // ignore — handled below
  }

  const quoteCurrency = (profile.currency || (currency.toUpperCase() === "USD" ? "USD" : "")).toUpperCase();
  if (!quoteCurrency) {
    return errorResponse(
      "unsupported_currency",
      "Could not determine the trading currency for this ticker; set the asset's currency to USD or try again.",
      400,
    );
  }

  return {
    unitPrice: body.c,
    currency: quoteCurrency,
    asOf: new Date().toISOString(),
    source: "finnhub",
    openPrice: typeof body.o === "number" && body.o > 0 ? body.o : undefined,
    previousClose: typeof body.pc === "number" && body.pc > 0 ? body.pc : undefined,
    dayChangePct: typeof body.dp === "number" ? body.dp : undefined,
    exchange: profile.exchange || undefined,
  };
}

// ---------------------------------------------------------------------------
// Yahoo Finance fallback (non-US listings)
//
// Finnhub's free tier only covers US stocks. Listings on Euronext, DFM, ADX,
// LSE, ... are priced from Yahoo Finance's public endpoints instead:
//   - `/v8/finance/chart/<symbol>`  -> regularMarketPrice, chartPreviousClose,
//     currency, exchange name (and the day's open)
//   - `/v1/finance/search?q=<ISIN>` -> resolves the Yahoo symbol from an ISIN
//
// Deliberately NOT the `yahoo-finance2` npm library: its `quote()` goes
// through Yahoo's cookie/crumb flow, which returned HTTP 429 "Too Many
// Requests" for every symbol (even AAPL) when tried, and v2 is flagged
// unmaintained; the two plain endpoints above returned data immediately and
// need no crumb, dependency or Deno npm shim.
//
// Routing (`fetchEquityWithRouting`): a US exchange goes to Finnhub; a known
// non-US exchange goes straight to Yahoo (no wasted Finnhub call); an unknown
// exchange tries Finnhub first and falls back to Yahoo when Finnhub reports
// `no_data`. Saxo tickers aren't always Yahoo tickers (Saxo `UBIP` = Yahoo
// `UBI.PA`), so the ISIN is searched first and `<ticker><suffix>` guesses
// are the fallback.
// ---------------------------------------------------------------------------

const US_EXCHANGES = new Set([
  "NASDAQ", "NYSE", "XNAS", "XNYS", "ARCX", "XASE", "AMEX", "NMS", "NYQ", "NGM", "NCM", "PCX",
]);

/** ISO-10383 MIC -> Yahoo suffix. */
const MIC_SUFFIX: Record<string, string> = {
  XPAR: ".PA", XAMS: ".AS", XBRU: ".BR", XLIS: ".LS", XMIL: ".MI", XETR: ".DE", XFRA: ".F",
  XLON: ".L", XSWX: ".SW", XDFM: ".AE", XADS: ".AD", XTSE: ".TO", XASX: ".AX",
};

/** Normalised display exchange (as the app stores it) -> Yahoo suffix. */
const NAME_SUFFIX: Record<string, string> = {
  EURONEXT: ".PA", DFM: ".AE", ADX: ".AD", LSE: ".L", XETRA: ".DE",
  "BORSA ITALIANA": ".MI", SIX: ".SW", TSX: ".TO", ASX: ".AX",
};

/** ISIN country prefix -> Yahoo suffix (tells Paris from Amsterdam/Brussels/Lisbon on Euronext). */
const ISIN_SUFFIX: Record<string, string> = {
  FR: ".PA", NL: ".AS", BE: ".BR", PT: ".LS", IT: ".MI", DE: ".DE", GB: ".L", CH: ".SW", AE: ".AE",
};

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; OpesWealth/1.0)",
  Accept: "application/json",
};

function yahooSuffixes(exchange: string, isin: string): string[] {
  const out: string[] = [];
  const push = (s?: string) => s && !out.includes(s) && out.push(s);
  push(MIC_SUFFIX[exchange]);
  const country = isin.slice(0, 2);
  if (exchange === "EURONEXT" || exchange === "") push(ISIN_SUFFIX[country]);
  push(NAME_SUFFIX[exchange]);
  // UAE: DFM is ".AE", ADX is ".AD" — when only the ISIN says "AE", try both.
  if (country === "AE") {
    push(".AE");
    push(".AD");
  }
  return out;
}

type YahooGet =
  | { ok: true; json: any }
  | { ok: false; kind: "rate_limited" | "not_found" | "timeout" | "network" | "invalid" };

async function yahooGet(url: string): Promise<YahooGet> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS, signal: controller.signal });
    if (res.status === 429) return { ok: false, kind: "rate_limited" };
    if (res.status === 404) return { ok: false, kind: "not_found" };
    if (!res.ok) return { ok: false, kind: "network" };
    try {
      return { ok: true, json: await res.json() };
    } catch {
      return { ok: false, kind: "invalid" };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return { ok: false, kind: "timeout" };
    return { ok: false, kind: "network" };
  } finally {
    clearTimeout(timeout);
  }
}

/** Resolves a Yahoo symbol from an ISIN, preferring a listing on the expected exchange suffix. */
async function yahooSymbolFromIsin(
  isin: string,
  suffixes: string[],
): Promise<string | null | "rate_limited"> {
  const r = await yahooGet(
    `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=6&newsCount=0`,
  );
  if (!r.ok) return r.kind === "rate_limited" ? "rate_limited" : null;
  const quotes: { symbol?: string; quoteType?: string }[] = Array.isArray(r.json?.quotes)
    ? r.json.quotes
    : [];
  const tradable = quotes.filter(
    (q) => q.symbol && (q.quoteType === "EQUITY" || q.quoteType === "ETF"),
  );
  const preferred = tradable.find((q) => suffixes.some((s) => q.symbol!.endsWith(s)));
  return (preferred ?? tradable[0])?.symbol ?? null;
}

/**
 * Ordered Yahoo symbols to try for an equity: the ISIN-resolved symbol first
 * (Saxo `UBIP` is Yahoo `UBI.PA`), then `<ticker><suffix>` guesses. Returns a
 * rate-limit Response if the ISIN lookup itself was throttled.
 */
async function yahooCandidateSymbols(req: PriceRequest): Promise<string[] | Response> {
  const ticker = (req.symbol ?? "").trim().toUpperCase();
  const exchange = (req.exchange ?? "").trim().toUpperCase();
  const isin = (req.isin ?? "").trim().toUpperCase();
  const suffixes = yahooSuffixes(exchange, isin);

  const candidates: string[] = [];
  const add = (s: string) => s && !candidates.includes(s) && candidates.push(s);

  if (isin) {
    const resolved = await yahooSymbolFromIsin(isin, suffixes);
    if (resolved === "rate_limited") {
      return errorResponse("rate_limited", "Yahoo Finance's rate limit was hit. Try again shortly.", 429);
    }
    if (resolved) add(resolved);
  }
  // No exchange/ISIN hints at all (e.g. an unknown-exchange import): the bare
  // ticker is the only guess left (US-style symbols resolve as-is on Yahoo).
  if (suffixes.length === 0) add(ticker);
  for (const suffix of suffixes) {
    add(ticker + suffix);
    // Some Saxo Euronext tickers carry a trailing exchange letter (UBIP -> UBI).
    if (ticker.length > 3 && /[A-Z]$/.test(ticker)) add(ticker.slice(0, -1) + suffix);
  }
  return candidates;
}

async function fetchYahooPrice(req: PriceRequest): Promise<PriceSuccess | Response> {
  const ticker = (req.symbol ?? "").trim().toUpperCase();
  const found = await yahooCandidateSymbols(req);
  if (found instanceof Response) return found;
  const candidates = found;

  for (const symbol of candidates) {
    const r = await yahooGet(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
    );
    if (!r.ok) {
      if (r.kind === "rate_limited") {
        return errorResponse("rate_limited", "Yahoo Finance's rate limit was hit. Try again shortly.", 429);
      }
      if (r.kind === "timeout") return errorResponse("timeout", "Yahoo Finance took too long to respond.", 504);
      if (r.kind === "network") return errorResponse("network_error", "Could not reach Yahoo Finance.", 502);
      continue; // not_found / invalid: try the next candidate
    }

    const result = r.json?.chart?.result?.[0];
    const meta = result?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number" || !(price > 0)) continue;

    // London quotes are in pence (GBp/GBX): convert to pounds.
    const pence = meta.currency === "GBp" || meta.currency === "GBX";
    const scale = pence ? 0.01 : 1;
    const currency = pence ? "GBP" : String(meta.currency ?? req.currency).toUpperCase();
    const previousClose = meta.chartPreviousClose ?? meta.previousClose;
    const opens = (result?.indicators?.quote?.[0]?.open ?? []).filter(
      (n: unknown): n is number => typeof n === "number" && n > 0,
    );

    return {
      unitPrice: price * scale,
      currency,
      asOf: new Date().toISOString(),
      source: "yahoo",
      openPrice: opens.length ? opens[opens.length - 1] * scale : undefined,
      previousClose:
        typeof previousClose === "number" && previousClose > 0 ? previousClose * scale : undefined,
      dayChangePct:
        typeof meta.regularMarketChangePercent === "number"
          ? meta.regularMarketChangePercent
          : typeof previousClose === "number" && previousClose > 0
            ? (price / previousClose - 1) * 100
            : undefined,
      exchange: meta.fullExchangeName || meta.exchangeName || undefined,
    };
  }

  return errorResponse(
    "no_data",
    `Yahoo Finance has no quote for "${ticker}" (tried ${candidates.join(", ") || "no candidate symbols"}).`,
    404,
  );
}

/**
 * Daily closes since `req.from` for a holding (history mode). Yahoo's chart
 * closes are split-ADJUSTED, but the trade ledger's quantities are as-traded,
 * so each close is multiplied back by every split that happened after it —
 * otherwise quantity × price would be off by the split ratio before a split
 * (e.g. Tesla's 2020 5:1 and 2022 3:1). Dates use the exchange's local day.
 */
async function fetchYahooHistory(req: PriceRequest): Promise<Record<string, unknown> | Response> {
  const found = await yahooCandidateSymbols(req);
  if (found instanceof Response) return found;

  const fromMs = Date.parse((req.from ?? "") + "T00:00:00Z");
  if (!Number.isFinite(fromMs)) return errorResponse("invalid_request", "from must be YYYY-MM-DD.", 400);
  const period1 = Math.floor(fromMs / 1000) - 7 * 86400;
  const period2 = Math.floor(Date.now() / 1000) + 86400;

  for (const symbol of found) {
    const r = await yahooGet(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=split`,
    );
    if (!r.ok) {
      if (r.kind === "rate_limited") {
        return errorResponse("rate_limited", "Yahoo Finance's rate limit was hit. Try again shortly.", 429);
      }
      if (r.kind === "timeout") return errorResponse("timeout", "Yahoo Finance took too long to respond.", 504);
      if (r.kind === "network") return errorResponse("network_error", "Could not reach Yahoo Finance.", 502);
      continue;
    }

    const result = r.json?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    if (timestamps.length === 0) continue;

    const offset: number = result.meta?.gmtoffset ?? 0;
    const pence = result.meta?.currency === "GBp" || result.meta?.currency === "GBX";
    const currency = pence ? "GBP" : String(result.meta?.currency ?? req.currency).toUpperCase();
    const splits: { ts: number; ratio: number }[] = Object.values(result.events?.splits ?? {}).map(
      (sp: any) => ({ ts: Number(sp.date), ratio: Number(sp.numerator) / Number(sp.denominator) }),
    );

    const prices: [string, number][] = [];
    timestamps.forEach((ts, i) => {
      const close = closes[i];
      if (typeof close !== "number" || !(close > 0)) return;
      let factor = 1;
      for (const sp of splits) if (sp.ts > ts && Number.isFinite(sp.ratio) && sp.ratio > 0) factor *= sp.ratio;
      const date = new Date((ts + offset) * 1000).toISOString().slice(0, 10);
      prices.push([date, close * factor * (pence ? 0.01 : 1)]);
    });
    if (prices.length === 0) continue;

    return { symbol, currency, source: "yahoo", prices };
  }

  return errorResponse("no_data", `Yahoo Finance has no price history for "${req.symbol}".`, 404);
}

/** The error code of one of this function's own error Responses. */
async function errorCodeOf(res: Response): Promise<string | undefined> {
  try {
    return (await res.clone().json())?.error?.code;
  } catch {
    return undefined;
  }
}

async function fetchEquityWithRouting(req: PriceRequest): Promise<PriceSuccess | Response> {
  const exchange = (req.exchange ?? "").trim().toUpperCase();
  const knownNonUs = exchange !== "" && exchange !== "OTHER" && !US_EXCHANGES.has(exchange);

  // Finnhub's free tier can't quote non-US listings: skip it entirely.
  if (knownNonUs) return await fetchYahooPrice(req);

  const finnhub = await fetchEquityPrice(req.symbol!, req.currency);
  if (!(finnhub instanceof Response)) return finnhub;
  if ((await errorCodeOf(finnhub)) !== "no_data") return finnhub;

  // Finnhub has nothing for this ticker (unknown exchange, or not covered):
  // Yahoo may. If it doesn't either, report Finnhub's original `no_data`.
  const yahoo = await fetchYahooPrice(req);
  if (!(yahoo instanceof Response)) return yahoo;
  return (await errorCodeOf(yahoo)) === "no_data" ? finnhub : yahoo;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return errorResponse("invalid_request", "Only POST is supported.", 405);
  }

  let body: PriceRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse("invalid_request", "Request body must be valid JSON.", 400);
  }

  if (!body.assetId || typeof body.assetId !== "string") {
    return errorResponse("invalid_request", "assetId is required.", 400);
  }
  if (!body.currency || typeof body.currency !== "string") {
    return errorResponse("invalid_request", "currency is required.", 400);
  }

  if (body.mode === "history") {
    if (body.category !== "equities" || !body.symbol || !body.from) {
      return errorResponse("invalid_request", "history needs category=equities, symbol and from.", 400);
    }
    const history = await fetchYahooHistory(body);
    return history instanceof Response ? history : jsonResponse(history, 200);
  }

  let result: PriceSuccess | Response;

  if (body.category === "crypto") {
    if (!body.coingeckoId || typeof body.coingeckoId !== "string") {
      return errorResponse("invalid_request", "coingeckoId is required for crypto.", 400);
    }
    result = await fetchCryptoPrice(body.coingeckoId, body.currency);
  } else if (body.category === "equities") {
    if (!body.symbol || typeof body.symbol !== "string") {
      return errorResponse("invalid_request", "symbol is required for equities.", 400);
    }
    result = await fetchEquityWithRouting(body);
  } else {
    return errorResponse("invalid_request", 'category must be "equities" or "crypto".', 400);
  }

  if (result instanceof Response) {
    return result;
  }

  return jsonResponse(result, 200);
});
