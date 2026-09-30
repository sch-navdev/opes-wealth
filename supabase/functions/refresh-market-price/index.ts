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
}

interface PriceSuccess {
  unitPrice: number;
  currency: string;
  asOf: string;
  source: "coingecko" | "finnhub";
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

  if (res.status === 429) {
    return errorResponse("rate_limited", "Finnhub's rate limit was hit. Try again shortly.", 429);
  }
  if (res.status === 403) {
    return errorResponse(
      "invalid_symbol",
      `Finnhub's free tier doesn't cover "${symbol}" (non-US listings need a paid plan).`,
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
  if (allZero || typeof body.c !== "number") {
    return errorResponse(
      "invalid_symbol",
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
    result = await fetchEquityPrice(body.symbol, body.currency);
  } else {
    return errorResponse("invalid_request", 'category must be "equities" or "crypto".', 400);
  }

  if (result instanceof Response) {
    return result;
  }

  return jsonResponse(result, 200);
});
