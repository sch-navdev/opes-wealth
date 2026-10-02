/**
 * Live watch valuation with a provider waterfall (server-only: reads secrets
 * from `process.env`). Providers are tried in order and a failure of any kind
 * (network error, timeout, non-2xx such as 429, unreadable body) silently falls
 * through to the next configured one:
 *
 *   1. Chrono24     CHRONO24_API_URL + CHRONO24_API_KEY — `<url>?ref=…`, Bearer token, reads `marketPrice`
 *   2. WatchCharts  WATCHCHARTS_API_KEY — `X-Api-Key` header, reads `estimated_market_price`
 *   3. TheWatchAPI  THEWATCHAPI_KEY — `api_token` query parameter, reads `data[0].price`
 *
 * When no provider is configured, or every attempt fails, it throws
 * `WatchValuationError` so the UI can fall back to manual valuation.
 *
 * Endpoints and response fields follow the owner's brief; none of these three
 * has been exercised against a real account. The APIs return no currency, so
 * the price is treated as USD by callers (convert from there). Dependency-free
 * on purpose (no `@/` imports) so scripts can run it directly.
 */
export type WatchQuery = {
  brand?: string;
  model?: string;
  referenceNumber: string;
};

export type WatchValuation = { price: number; provider: string };

export type WatchValuationErrorCode = "no_reference" | "not_configured" | "all_failed";

export class WatchValuationError extends Error {
  readonly code: WatchValuationErrorCode;
  /** Per-provider reasons, for logs and the test script (never shown to users as-is). */
  readonly attempts: string[];

  constructor(code: WatchValuationErrorCode, message: string, attempts: string[] = []) {
    super(message);
    this.name = "WatchValuationError";
    this.code = code;
    this.attempts = attempts;
  }
}

type Provider = {
  name: string;
  /** Custom extraction when the price is not a top-level (or `data.`) field. */
  extract?: (body: unknown) => number | null;
  /** `null` when the provider's env vars are not set (skipped, not attempted). */
  build: (ref: string) => { url: string; headers: Record<string, string> } | null;
  field: string;
};

const TIMEOUT_MS = 10_000;

const PROVIDERS: Provider[] = [
  {
    name: "chrono24",
    field: "marketPrice",
    build: (ref) => {
      const base = process.env.CHRONO24_API_URL;
      const key = process.env.CHRONO24_API_KEY;
      if (!base || !key) return null;
      return {
        url: `${base}${base.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}`,
        headers: { Authorization: `Bearer ${key}` },
      };
    },
  },
  {
    name: "watchcharts",
    field: "estimated_market_price",
    build: (ref) => {
      const key = process.env.WATCHCHARTS_API_KEY;
      if (!key) return null;
      return {
        url: `https://api.watchcharts.com/v1/market/query?ref=${encodeURIComponent(ref)}`,
        headers: { "X-Api-Key": key },
      };
    },
  },
  {
    name: "thewatchapi",
    field: "price",
    // The search endpoint returns an array in `data`; take the first match's price.
    extract: (body) => {
      const data = body && typeof body === "object" ? (body as { data?: unknown }).data : null;
      const first = Array.isArray(data) ? data[0] : null;
      return first && typeof first === "object" ? toPrice((first as Record<string, unknown>).price) : null;
    },
    build: (ref) => {
      const key = process.env.THEWATCHAPI_KEY;
      if (!key) return null;
      return {
        url: `https://api.thewatchapi.com/v1/model/search?api_token=${encodeURIComponent(key)}&search=${encodeURIComponent(ref)}`,
        headers: {},
      };
    },
  },
];

/** A positive finite number from a number or numeric string, else null. */
function toPrice(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.replace(/[, ]/g, "")) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Reads `field` from the body's top level, or from a nested `data` object. */
function extractPrice(body: unknown, field: string): number | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const direct = toPrice(root[field]);
  if (direct != null) return direct;
  const data = root.data;
  return data && typeof data === "object" ? toPrice((data as Record<string, unknown>)[field]) : null;
}

export async function fetchLiveWatchValuation(query: WatchQuery): Promise<WatchValuation> {
  const ref = query.referenceNumber?.trim();
  if (!ref) {
    throw new WatchValuationError("no_reference", "A reference number is required for a live watch valuation.");
  }

  const attempts: string[] = [];
  let configured = 0;

  for (const provider of PROVIDERS) {
    const request = provider.build(ref);
    if (!request) continue;
    configured += 1;

    try {
      const res = await fetch(request.url, {
        headers: { Accept: "application/json", ...request.headers },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        attempts.push(`${provider.name}: HTTP ${res.status}${res.status === 429 ? " (rate limited)" : ""}`);
        continue;
      }
      const body = await res.json();
      const price = provider.extract ? provider.extract(body) : extractPrice(body, provider.field);
      if (price == null) {
        attempts.push(`${provider.name}: no usable "${provider.field}" in the response`);
        continue;
      }
      return { price, provider: provider.name };
    } catch (err) {
      attempts.push(`${provider.name}: ${err instanceof Error ? err.message : "request failed"}`);
    }
  }

  if (configured === 0) {
    throw new WatchValuationError(
      "not_configured",
      "No watch valuation provider is configured (CHRONO24_API_URL/KEY, WATCHCHARTS_API_KEY or THEWATCHAPI_KEY).",
    );
  }
  throw new WatchValuationError(
    "all_failed",
    `All ${configured} configured watch valuation provider(s) failed.`,
    attempts,
  );
}
