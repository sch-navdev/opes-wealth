import { METAL_YAHOO_SYMBOL, type MetalType } from "@/lib/precious-metals";

export type MetalSpotResult =
  | { ok: true; usdPerTroyOunce: number; asOf: string; source: "yahoo" }
  | { ok: false; code: "rate_limited" | "no_data" | "network_error"; error: string };

/**
 * USD spot price per troy ounce, from Yahoo Finance's public chart endpoint
 * (COMEX front-month futures GC=F / SI=F / PL=F — the standard free spot
 * proxy; it tracks spot within a small basis). Server-side use only (imported by server actions), so no
 * key, CORS or Edge Function deploy is involved. Same direct-endpoint approach
 * `refresh-market-price` uses for non-US equities (the crumb-based wrapper
 * libraries get 429s).
 */
export async function fetchMetalSpotUsd(metal: MetalType): Promise<MetalSpotResult> {
  const symbol = encodeURIComponent(METAL_YAHOO_SYMBOL[metal]);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; OpesWealth/1.0)" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 429) {
      return { ok: false, code: "rate_limited", error: "Yahoo Finance rate limit hit." };
    }
    if (!response.ok) {
      return { ok: false, code: "no_data", error: `Yahoo Finance returned ${response.status}.` };
    }
    const body = (await response.json()) as {
      chart?: {
        result?: { meta?: { regularMarketPrice?: number; regularMarketTime?: number } }[];
      };
    };
    const meta = body.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number" || !(price > 0)) {
      return { ok: false, code: "no_data", error: "No spot price in the response." };
    }
    const asOf = meta?.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString();
    return { ok: true, usdPerTroyOunce: price, asOf, source: "yahoo" };
  } catch (e) {
    return {
      ok: false,
      code: "network_error",
      error: e instanceof Error ? e.message : "Couldn't reach Yahoo Finance.",
    };
  } finally {
    clearTimeout(timer);
  }
}
