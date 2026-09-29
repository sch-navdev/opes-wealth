/**
 * Foreign-exchange rate service — server-only module, same architecture as
 * `dld-client.ts`/`adrec-client.ts`/`vehicle-valuation-client.ts`
 * (`FX_MOCK_MODE`/missing-config fallback, typed error-code union,
 * `{ok:true,isMock}|{ok:false,code,error}` result shape), but with no OAuth
 * step — the free public FX providers this app targets (open.er-api.com,
 * Frankfurter) don't require client credentials, only a base-URL override
 * for tests/self-hosting.
 *
 * Unlike the other MOCK_MODE clients, this one is never actually stubbed in
 * practice (the real provider needs no API key, so `isMockMode()` only ever
 * trips from an explicit `FX_MOCK_MODE=true` override) — the mock path
 * exists for offline development and tests, not because the real API is
 * unreachable without credentials.
 *
 * Rates are cached in memory per base currency for `CACHE_TTL_MS`, so a
 * dashboard hit by several requests in a short window doesn't refetch rates
 * on every load.
 */

export type FxErrorCode =
  | "invalid_request"
  | "provider_not_configured"
  | "invalid_response"
  | "rate_limited"
  | "timeout"
  | "network_error";

export class FxServiceError extends Error {
  code: FxErrorCode;

  constructor(code: FxErrorCode, message: string) {
    super(message);
    this.name = "FxServiceError";
    this.code = code;
  }
}

export type FxRatesData = {
  base: string;
  /** Every rate is anchored to `base` (e.g. `rates.EUR` is how many EUR one unit of `base` buys), including `rates[base] === 1`. */
  rates: Record<string, number>;
  fetchedAt: string;
};

export type FxRatesResult =
  | ({ ok: true; isMock: boolean } & FxRatesData)
  | { ok: false; code: FxErrorCode; error: string };

// --- Mock mode ----------------------------------------------------------

function isMockMode(): boolean {
  return process.env.FX_MOCK_MODE === "true";
}

/** Static approximation used both as the mock-mode response and as this module's own last-resort fallback if the real provider is unreachable — realistic enough for portfolio display, not intended as a trading-grade rate. */
const MOCK_RATES_FROM_USD: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  CHF: 0.88,
  JPY: 149.5,
  CAD: 1.36,
  AUD: 1.52,
  SGD: 1.34,
};

function mockFxRates(base: string): FxRatesData {
  const baseRate = MOCK_RATES_FROM_USD[base] ?? 1;
  const rates: Record<string, number> = {};
  for (const [code, rateFromUsd] of Object.entries(MOCK_RATES_FROM_USD)) {
    rates[code] = rateFromUsd / baseRate;
  }
  return { base, rates, fetchedAt: new Date().toISOString() };
}

// --- In-memory cache ------------------------------------------------------

type CacheEntry = { data: FxRatesData; expiresAt: number };

const cache = new Map<string, CacheEntry>();

/** 12 hours — FX rates don't need to be any fresher than that for portfolio display purposes (same cadence the app's original `getExchangeRatesFromUsd` used via Next's fetch cache). */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// --- Shared request helper ------------------------------------------------

const REQUEST_TIMEOUT_MS = 8_000;

type OpenErApiResponse = { result: string; rates: Record<string, number> };

async function callFxProvider(base: string): Promise<FxRatesData> {
  const baseUrl = process.env.FX_API_BASE_URL ?? "https://open.er-api.com/v6/latest";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/${base}`, { signal: controller.signal });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new FxServiceError("timeout", "The exchange rate request timed out.");
      }
      throw new FxServiceError("network_error", "Could not reach the exchange rate provider.");
    }

    if (response.status === 429) {
      throw new FxServiceError("rate_limited", "Too many requests — try again shortly.");
    }
    if (!response.ok) {
      throw new FxServiceError(
        "network_error",
        `Exchange rate request failed (${response.status}).`,
      );
    }

    const json = (await response.json()) as OpenErApiResponse;
    if (json.result !== "success" || !json.rates) {
      throw new FxServiceError("invalid_response", "Received an unexpected exchange rate response.");
    }

    return { base, rates: { [base]: 1, ...json.rates }, fetchedAt: new Date().toISOString() };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetches (or returns the cached) exchange rates anchored to `base`. Checks
 * the in-memory cache first, then either serves the deterministic mock table
 * (mock mode) or calls the real provider. On a real provider failure, this
 * returns `{ok: false}` honestly (same convention as `dld-client.ts` etc.)
 * rather than quietly substituting fake data — callers that need a rate
 * table no matter what (e.g. rendering the dashboard) decide their own
 * fallback, same as `lib/fx.ts`'s `getExchangeRatesFromUsd` does below.
 */
export async function getFxRates(base: string): Promise<FxRatesResult> {
  if (!base) {
    return { ok: false, code: "invalid_request", error: "A base currency is required." };
  }

  const cached = cache.get(base);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, isMock: isMockMode(), ...cached.data };
  }

  if (isMockMode()) {
    const data = mockFxRates(base);
    cache.set(base, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return { ok: true, isMock: true, ...data };
  }

  try {
    const data = await callFxProvider(base);
    cache.set(base, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return { ok: true, isMock: false, ...data };
  } catch (err) {
    if (err instanceof FxServiceError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: "network_error", error: "An unexpected error occurred." };
  }
}
