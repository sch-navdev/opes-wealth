import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumnError, type AssetHistorySource } from "@/lib/asset-history";
import { convertAmount, getExchangeRatesFromUsd } from "@/lib/fx";
import { normalizeExchange, parseEquityMetadata } from "@/lib/equities";
import { parseCryptoMetadata } from "@/lib/crypto";
import { isDemoUser } from "@/lib/demo-mode";
import type { Json } from "@/types/supabase";

/**
 * Shared price-refresh logic used by BOTH the user-triggered server actions
 * (`app/dashboard/actions.ts`) and the daily cron (`/api/cron/refresh-prices`).
 * Everything here takes the Supabase client as a parameter so the cron can pass
 * the service-role client (no user session) and the actions the user's client.
 */

/** A live quote, in the listing's trading currency. */
export type LiveQuote = {
  unitPrice: number;
  currency: string;
  asOf: string;
  source: AssetHistorySource;
  openPrice?: number;
  previousClose?: number;
  dayChangePct?: number;
  exchange?: string;
};

export type QuoteOutcome =
  | { ok: true; quote: LiveQuote }
  | { ok: false; code: string; error: string };

/**
 * Normalizes an Edge Function `invoke` result (transport error, in-body
 * `{error}`, or a success payload) into one outcome. A non-2xx response is a
 * generic transport error whose real `{ error: { code, message } }` body sits
 * on `error.context`.
 */
export async function parseQuoteResponse(
  result: { data: unknown; error: unknown },
  fallbackCurrency: string,
  defaultSource: AssetHistorySource,
): Promise<QuoteOutcome> {
  const { error } = result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data as any;
  if (error) {
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) {
        return { ok: false, code: body.error.code ?? "network_error", error: body.error.message };
      }
    } catch {
      // fall through
    }
    return { ok: false, code: "network_error", error: (error as { message?: string }).message ?? "network error" };
  }
  if (data?.error) {
    return { ok: false, code: data.error.code ?? "network_error", error: data.error.message };
  }
  if (typeof data?.unitPrice !== "number" || !(data.unitPrice > 0)) {
    return { ok: false, code: "invalid_response", error: "Received an unexpected quote response." };
  }
  return {
    ok: true,
    quote: {
      unitPrice: data.unitPrice,
      currency: String(data.currency ?? fallbackCurrency).toUpperCase(),
      asOf: data.asOf ?? new Date().toISOString(),
      source: (data.source ?? defaultSource) as AssetHistorySource,
      openPrice: data.openPrice,
      previousClose: data.previousClose,
      dayChangePct: data.dayChangePct,
      exchange: data.exchange,
    },
  };
}

export type HistoryUpsertRow = {
  asset_id: string;
  recorded_date: string;
  value: number;
  net_equity: number | null;
  source: AssetHistorySource;
  /** File name of the import this row came from (migration 0041); dropped automatically while the column does not exist yet. */
  source_ref?: string | null;
};

/**
 * Upserts `asset_history` rows on (asset_id, recorded_date), in chunks. On a
 * CHECK violation (`23514`: the live `asset_history_source_check` can lag the
 * app's `AssetHistorySource` union, migration 0015) the chunk is retried as
 * `manual`, the one value every version of the constraint allows (`source_ref` is kept). A missing
 * `source_ref` column (migration 0041 not applied) retries the chunk without it. Returns the error
 * rather than throwing.
 */
export async function upsertHistoryRowsWithFallback(supabase: SupabaseClient, rows: HistoryUpsertRow[]) {
  if (rows.length === 0) return null;
  const write = (batch: HistoryUpsertRow[]) =>
    supabase.from("asset_history").upsert(batch, { onConflict: "asset_id,recorded_date" });
  const withoutRef = (batch: HistoryUpsertRow[]) =>
    batch.map((r) => {
      const { source_ref: _ref, ...rest } = r;
      void _ref;
      return rest as HistoryUpsertRow;
    });

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    let batch = rows.slice(i, i + CHUNK);
    let { error } = await write(batch);
    // Migration 0041 not applied yet: the file name cannot be stored, the rows still can.
    if (isMissingColumnError(error, "source_ref")) {
      batch = withoutRef(batch);
      ({ error } = await write(batch));
    }
    if (error?.code === "23514") {
      ({ error } = await write(batch.map((r) => ({ ...r, source: "manual" as AssetHistorySource }))));
    }
    if (error) return error;
  }
  return null;
}

export type PriceableAsset = {
  id: string;
  quantity: number;
  currency: string;
  metadata: Json | null;
};

/** Pure: what a quote does to an asset (converted unit price, total, next metadata, history row). */
export function buildQuoteUpdate(asset: PriceableAsset, quote: LiveQuote, rates: Record<string, number>) {
  const toAssetCurrency = (n: number) => convertAmount(n, quote.currency, asset.currency, rates);
  const unitPrice = toAssetCurrency(quote.unitPrice);
  const quantity = asset.quantity ?? 1;
  const totalValue = quantity * unitPrice;

  const existingMetadata =
    asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? (asset.metadata as Record<string, Json>)
      : {};

  const nextMetadata: Record<string, Json> = {
    ...existingMetadata,
    last_unit_price: unitPrice,
    last_priced_at: quote.asOf,
    last_price_source: quote.source,
  };
  if (quote.openPrice != null) nextMetadata.open_price = toAssetCurrency(quote.openPrice);
  if (quote.previousClose != null) nextMetadata.previous_close = toAssetCurrency(quote.previousClose);
  if (quote.dayChangePct != null) nextMetadata.day_change_pct = quote.dayChangePct;
  if (quote.exchange) nextMetadata.exchange = normalizeExchange(quote.exchange);

  const historyRow: HistoryUpsertRow = {
    asset_id: asset.id,
    recorded_date: quote.asOf.slice(0, 10),
    value: totalValue,
    net_equity: totalValue,
    source: quote.source,
  };
  return { unitPrice, totalValue, nextMetadata, historyRow };
}

/**
 * Writes a quote onto an asset. `ownerId` scopes the update (`profile_id`),
 * same as the user-facing path. Never called with a failed/empty quote.
 */
export async function persistQuoteWith(
  supabase: SupabaseClient,
  ownerId: string,
  asset: PriceableAsset,
  quote: LiveQuote,
  rates: Record<string, number>,
): Promise<{ error: string } | { unitPrice: number; totalValue: number; asOf: string }> {
  const { unitPrice, totalValue, nextMetadata, historyRow } = buildQuoteUpdate(asset, quote, rates);

  const { error: updateError } = await supabase
    .from("assets")
    .update({ current_value: totalValue, metadata: nextMetadata })
    .eq("id", asset.id)
    .eq("profile_id", ownerId);
  if (updateError) return { error: updateError.message };

  const historyError = await upsertHistoryRowsWithFallback(supabase, [historyRow]);
  if (historyError) return { error: historyError.message };

  return { unitPrice, totalValue, asOf: quote.asOf };
}

// ---------------------------------------------------------------------------
// Cron run
// ---------------------------------------------------------------------------

export type CronAsset = PriceableAsset & {
  profile_id: string;
  kind: "equity" | "crypto";
  ticker: string | null;
  coingeckoId: string | null;
  exchange?: string;
  isin?: string;
};

export type CronSummary = {
  refreshed: number;
  skipped: number;
  failed: number;
  /** Assets not attempted because the time budget ran out or a provider was unusable (they keep their last price). */
  stopped_early: number;
};

const FINNHUB_STOP_CODES = new Set(["invalid_api_key", "provider_not_configured", "rate_limited"]);
const CRYPTO_STOP_CODES = new Set(["rate_limited"]);

/** The date (UTC, `YYYY-MM-DD`) an asset was last priced, from `metadata.last_priced_at`; `""` if never. */
export function lastPricedDate(metadata: Json | null): string {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const v = (metadata as Record<string, Json>).last_priced_at;
    if (typeof v === "string") return v.slice(0, 10);
  }
  return "";
}

/** Keeps priceable assets not already priced today, oldest-priced first (never-priced first). */
export function selectAndOrder(assets: CronAsset[], today: string): CronAsset[] {
  return assets
    .filter((a) => a.quantity > 0 && lastPricedDate(a.metadata) !== today)
    .filter((a) => (a.kind === "equity" ? !!a.ticker?.trim() : !!a.coingeckoId?.trim()))
    .filter((a) => !isDemoUser(a.profile_id))
    .sort((a, b) => {
      const da = lastPricedDate(a.metadata);
      const db = lastPricedDate(b.metadata);
      return da < db ? -1 : da > db ? 1 : 0;
    });
}

/** Turns a raw `assets` row (+ category name) into a `CronAsset`, or `null` if it has nothing to price. */
export function toCronAsset(
  row: {
    id: string;
    profile_id: string;
    quantity: number | null;
    currency: string;
    ticker_symbol: string | null;
    metadata: Json | null;
  },
  kind: "equity" | "crypto",
): CronAsset {
  const eq = kind === "equity" ? parseEquityMetadata(row.metadata) : null;
  const crypto = kind === "crypto" ? parseCryptoMetadata(row.metadata) : null;
  return {
    id: row.id,
    profile_id: row.profile_id,
    quantity: Number(row.quantity ?? 0),
    currency: row.currency,
    metadata: row.metadata,
    kind,
    ticker: row.ticker_symbol,
    coingeckoId: crypto?.coingecko_id || null,
    exchange: eq ? eq.exchange_mic || eq.exchange || undefined : undefined,
    isin: eq?.isin,
  };
}

export type CronDeps = {
  fetchQuote: (asset: CronAsset) => Promise<QuoteOutcome>;
  persist: (asset: CronAsset, quote: LiveQuote, rates: Record<string, number>) => Promise<{ error: string } | object>;
  getRates: () => Promise<Record<string, number>>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

/**
 * Runs the daily refresh over `assets` (already loaded). Sequential, with a
 * pause after each provider call to respect Finnhub's 60 calls/min free tier,
 * and stops cleanly once `budgetMs` is spent. A failed or empty quote never
 * writes anything, so a holding keeps its last price.
 */
export async function runPriceRefresh(
  assets: CronAsset[],
  opts: { today: string; budgetMs: number; equityPauseMs?: number; cryptoPauseMs?: number },
  deps: CronDeps,
): Promise<CronSummary> {
  const summary: CronSummary = { refreshed: 0, skipped: 0, failed: 0, stopped_early: 0 };
  const queue = selectAndOrder(assets, opts.today);
  if (queue.length === 0) return summary;

  const start = deps.now();
  const equityPause = opts.equityPauseMs ?? 1100;
  const cryptoPause = opts.cryptoPauseMs ?? 2500;
  let equityStopped = false;
  let cryptoStopped = false;
  let rates: Record<string, number> | null = null;

  for (let i = 0; i < queue.length; i++) {
    const asset = queue[i];
    if (deps.now() - start >= opts.budgetMs) {
      summary.stopped_early += queue.length - i;
      break;
    }
    if ((asset.kind === "equity" && equityStopped) || (asset.kind === "crypto" && cryptoStopped)) {
      summary.stopped_early += 1;
      continue;
    }

    let quote: QuoteOutcome;
    try {
      quote = await deps.fetchQuote(asset);
    } catch {
      quote = { ok: false, code: "network_error", error: "fetch failed" };
    }

    if (!quote.ok) {
      if (quote.code === "no_data") {
        summary.skipped += 1;
      } else {
        summary.failed += 1;
        if (asset.kind === "equity" && FINNHUB_STOP_CODES.has(quote.code)) equityStopped = true;
        if (asset.kind === "crypto" && CRYPTO_STOP_CODES.has(quote.code)) cryptoStopped = true;
      }
    } else {
      try {
        // FX rates are fetched lazily, once, and only if a quote needs converting.
        if (!rates && quote.quote.currency !== asset.currency) rates = await deps.getRates();
        const persisted = await deps.persist(asset, quote.quote, rates ?? {});
        if ("error" in persisted) summary.failed += 1;
        else summary.refreshed += 1;
      } catch {
        summary.failed += 1;
      }
    }

    await deps.sleep(asset.kind === "equity" ? equityPause : cryptoPause);
  }
  return summary;
}

/** Wires `runPriceRefresh` to a real (service-role) Supabase client and the Edge Function. */
export function buildSupabaseDeps(supabase: SupabaseClient): CronDeps {
  return {
    fetchQuote: async (asset) =>
      parseQuoteResponse(
        await supabase.functions.invoke("refresh-market-price", {
          body:
            asset.kind === "equity"
              ? {
                  assetId: asset.id,
                  category: "equities",
                  symbol: asset.ticker?.trim(),
                  currency: asset.currency,
                  exchange: asset.exchange,
                  isin: asset.isin,
                }
              : {
                  assetId: asset.id,
                  category: "crypto",
                  coingeckoId: asset.coingeckoId,
                  currency: asset.currency,
                },
        }),
        asset.currency,
        asset.kind === "equity" ? "finnhub" : "coingecko",
      ),
    persist: (asset, quote, rates) => persistQuoteWith(supabase, asset.profile_id, asset, quote, rates),
    getRates: () => getExchangeRatesFromUsd(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}
