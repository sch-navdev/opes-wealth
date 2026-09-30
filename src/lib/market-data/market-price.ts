import { createClient } from "@/utils/supabase/client";

export type MarketPriceRequest = {
  assetId: string;
  category: "equities" | "crypto";
  symbol?: string;
  coingeckoId?: string;
  currency: string;
};

export type MarketPriceResult =
  | {
      ok: true;
      unitPrice: number;
      currency: string;
      asOf: string;
      source: "coingecko" | "finnhub";
      openPrice?: number;
      previousClose?: number;
      dayChangePct?: number;
      exchange?: string;
    }
  | { ok: false; code: string; error: string };

/**
 * Calls the `refresh-market-price` Edge Function for one Equities/Crypto
 * asset. Both providers behind it are real (CoinGecko always, Finnhub once
 * `FINNHUB_API_KEY` is set) -- see that function's file header. This
 * adapter's job is just normalizing the network-level `error`, the
 * in-body `{error}` payload, and a malformed success shape into one
 * `MarketPriceResult` union, same pattern as `fetchDariValuation`.
 */
export async function fetchMarketPrice(
  request: MarketPriceRequest,
): Promise<MarketPriceResult> {
  const supabase = createClient();

  const { data, error } = await supabase.functions.invoke("refresh-market-price", {
    body: request,
  });

  if (error) {
    return { ok: false, code: "network_error", error: error.message };
  }

  if (data?.error) {
    return {
      ok: false,
      code: data.error.code ?? "network_error",
      error: data.error.message ?? "The price request failed.",
    };
  }

  if (typeof data?.unitPrice !== "number" || !data?.asOf || !data?.source) {
    return {
      ok: false,
      code: "invalid_response",
      error: "Received an unexpected response from the pricing provider.",
    };
  }

  return {
    ok: true,
    unitPrice: data.unitPrice,
    currency: data.currency,
    asOf: data.asOf,
    source: data.source,
    openPrice: data.openPrice,
    previousClose: data.previousClose,
    dayChangePct: data.dayChangePct,
    exchange: data.exchange,
  };
}
