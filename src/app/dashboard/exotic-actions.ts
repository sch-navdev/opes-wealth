"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { convertAmount, getExchangeRatesFromUsd } from "@/lib/fx";
import { fetchLiveWatchValuation, WatchValuationError } from "@/lib/assets/watch-valuation";
import { parseExoticMetadata } from "@/lib/exotic-assets";

export type RefreshExoticValuationResult =
  | { ok: true; value: number; purchasePrice: number | null; asOf: string }
  | { ok: false; code: string; error: string };

/**
 * Exotic Assets (watches): reprices a piece from a live market
 * valuation (provider waterfall in `lib/assets/watch-valuation.ts`), converts it into the asset's own
 * currency, sets `current_value` = valuation × quantity, records the valuation
 * and its source in `metadata`, and upserts today's `asset_history` row. The
 * purchase price stays untouched, so the detail page can show market value vs.
 * what was paid. Returns `not_configured` when no provider key is set, `all_failed` when every configured one errors.
 */
export async function refreshExoticValuation(id: string): Promise<RefreshExoticValuationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "unauthenticated", error: "You must be signed in to refresh a valuation." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, quantity, currency, metadata, asset_categories(name)")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      quantity: number;
      currency: string;
      metadata: Record<string, unknown> | null;
      asset_categories: { name: string } | null;
    }>();
  if (!asset || asset.asset_categories?.name !== "Exotic Assets") {
    return { ok: false, code: "not_found", error: "Exotic asset not found." };
  }

  const exotic = parseExoticMetadata(asset.metadata);
  if (!exotic.reference_number.trim()) {
    return { ok: false, code: "missing_reference", error: "Set the reference number first." };
  }

  // Provider waterfall (Chrono24 → WatchCharts → TheWatchAPI). Prices are
  // treated as USD (none of the APIs states a currency) and converted below.
  let quote: { price: number; provider: string };
  try {
    quote = await fetchLiveWatchValuation({
      brand: exotic.brand,
      model: exotic.model,
      referenceNumber: exotic.reference_number,
    });
  } catch (err) {
    if (err instanceof WatchValuationError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: "all_failed", error: "Live valuation failed." };
  }
  const asOf = new Date().toISOString();

  const rates = asset.currency === "USD" ? {} : await getExchangeRatesFromUsd();
  const unitValue = convertAmount(quote.price, "USD", asset.currency, rates);
  const total = unitValue * (asset.quantity ?? 1);

  const { error: updateError } = await supabase
    .from("assets")
    .update({
      current_value: total,
      metadata: {
        ...(asset.metadata ?? {}),
        last_market_value: unitValue,
        last_priced_at: asOf,
        last_price_source: quote.provider,
      },
    })
    .eq("id", id)
    .eq("profile_id", user.id);
  if (updateError) return { ok: false, code: "db_error", error: updateError.message };

  const { error: historyError } = await supabase.from("asset_history").upsert(
    {
      asset_id: id,
      recorded_date: asOf.slice(0, 10),
      value: total,
      net_equity: total,
      source: "manual",
    },
    { onConflict: "asset_id,recorded_date" },
  );
  if (historyError) return { ok: false, code: "db_error", error: historyError.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${id}`);
  return { ok: true, value: unitValue, purchasePrice: exotic.purchase_price, asOf };
}
