/**
 * Live precious-metal spot price with a provider waterfall (server-only: reads
 * secrets from `process.env`), the metals twin of `watch-valuation.ts`:
 *
 *   1. GoldAPI.io  GOLDAPI_KEY      `https://www.goldapi.io/api/{XAU|XAG|XPT}/USD`, header `x-access-token`, reads `price`
 *   2. Metals-API  METALS_API_KEY   `https://metals-api.com/api/latest?access_key=…&base=USD&symbols=XAU`, reads `rates.USDXAU`
 *                                   (USD per troy ounce; falls back to 1 / `rates.XAU`)
 *
 * Any failure (network, 10 s timeout, non-2xx incl. 429, unusable body) falls
 * through. When no key is set or every call fails it throws
 * `MetalSpotError` — the caller (`market-data/metals-spot.ts`) then tries the
 * key-less Yahoo futures proxy, and finally the user's manually typed value
 * stands. Prices are USD per TROY OUNCE; weight/purity/premium maths stays in
 * `lib/precious-metals.ts`.
 *
 * Endpoints/fields follow the providers' public docs as remembered, and have
 * NOT been exercised with a real key. Dependency-free (no `@/` imports).
 */
export type MetalSymbol = "gold" | "silver" | "platinum";

export type MetalSpot = { usdPerTroyOunce: number; provider: string; asOf: string };

export class MetalSpotError extends Error {
  readonly code: "not_configured" | "all_failed";
  readonly attempts: string[];
  constructor(code: "not_configured" | "all_failed", message: string, attempts: string[] = []) {
    super(message);
    this.name = "MetalSpotError";
    this.code = code;
    this.attempts = attempts;
  }
}

const SYMBOL: Record<MetalSymbol, string> = { gold: "XAU", silver: "XAG", platinum: "XPT" };
const TIMEOUT_MS = 10_000;

const positive = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

type Provider = {
  name: string;
  build: (code: string) => { url: string; headers: Record<string, string> } | null;
  read: (body: Record<string, unknown>, code: string) => number | null;
};

const PROVIDERS: Provider[] = [
  {
    name: "goldapi",
    build: (code) => {
      const key = process.env.GOLDAPI_KEY;
      return key
        ? { url: `https://www.goldapi.io/api/${code}/USD`, headers: { "x-access-token": key } }
        : null;
    },
    read: (body) => positive(body.price),
  },
  {
    name: "metals-api",
    build: (code) => {
      const key = process.env.METALS_API_KEY;
      return key
        ? {
            url: `https://metals-api.com/api/latest?access_key=${encodeURIComponent(key)}&base=USD&symbols=${code}`,
            headers: {},
          }
        : null;
    },
    read: (body, code) => {
      const rates = body.rates;
      if (!rates || typeof rates !== "object") return null;
      const r = rates as Record<string, unknown>;
      const direct = positive(r[`USD${code}`]);
      if (direct != null) return direct;
      const perUsd = positive(r[code]); // troy ounces per 1 USD
      return perUsd != null ? 1 / perUsd : null;
    },
  },
];

export async function fetchLiveMetalSpot(metal: MetalSymbol): Promise<MetalSpot> {
  const code = SYMBOL[metal];
  const attempts: string[] = [];
  let configured = 0;

  for (const provider of PROVIDERS) {
    const request = provider.build(code);
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
      const price = provider.read((await res.json()) as Record<string, unknown>, code);
      if (price == null) {
        attempts.push(`${provider.name}: no usable price in the response`);
        continue;
      }
      return { usdPerTroyOunce: price, provider: provider.name, asOf: new Date().toISOString() };
    } catch (err) {
      attempts.push(`${provider.name}: ${err instanceof Error ? err.message : "request failed"}`);
    }
  }

  if (configured === 0) {
    throw new MetalSpotError("not_configured", "No metals API key is configured (GOLDAPI_KEY or METALS_API_KEY).");
  }
  throw new MetalSpotError("all_failed", `All ${configured} configured metals provider(s) failed.`, attempts);
}
