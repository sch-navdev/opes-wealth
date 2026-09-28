"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRealEstateMetadata, resolveRegistrationFee } from "@/lib/real-estate";
import type { AssetHistorySource } from "@/lib/asset-history";
import type { ParsedBankCsvRow } from "@/lib/bank-csv";
import { parseEquityMetadata, type EquityTrade } from "@/lib/equities";
import { tradeId } from "@/lib/parsers/broker-registry";
import type { AggregatedHolding } from "@/lib/parsers/types";
import type { Json } from "@/types/supabase";

function parseImages(formData: FormData): string[] {
  const raw = formData.get("images") as string | null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Auto-generates the `asset_history` timeline for an asset whenever it's
 * created or updated: a starting point on the earliest payment milestone's
 * due date (for off-plan Real Estate, the down payment milestone), one
 * point per "paid" milestone with the cumulative paid-to-date amount up to
 * that date, and one "current snapshot" point. That snapshot uses
 * `explicitDate` when given — `addAsset` passes the user's Purchase Date so
 * a freshly created asset's curve starts there instead of at row-creation
 * time — and otherwise falls back to today, which is what `updateAsset`
 * relies on (editing an asset always re-stamps today's snapshot; it never
 * moves the original purchase point). Since there's no recorded historical
 * market valuation at each past milestone date, those historical points use
 * cumulative cash invested (paid milestones + fees) for both `value` and
 * `net_equity` — a deliberate simplification flagged in the tracker notes,
 * not a claim that net equity equals cash invested in general. Upserts on
 * (asset_id, recorded_date) so re-saving the form regenerates the same
 * points instead of duplicating them.
 */
async function syncAssetHistory(
  supabase: SupabaseClient,
  assetId: string,
  currentValue: number,
  categoryName: string | null | undefined,
  metadata: Json,
  explicitDate?: string,
) {
  const snapshotDate = explicitDate || new Date().toISOString().slice(0, 10);
  const points = new Map<
    string,
    { asset_id: string; recorded_date: string; value: number; net_equity: number; source: "manual" }
  >();

  function addPoint(date: string, value: number, netEquity: number) {
    if (!date) return;
    points.set(date, {
      asset_id: assetId,
      recorded_date: date,
      value,
      net_equity: netEquity,
      source: "manual",
    });
  }

  const isRealEstate = categoryName === "Real Estate";

  if (isRealEstate) {
    const re = parseRealEstateMetadata(metadata);
    const totalFees =
      resolveRegistrationFee(re) +
      (re.agencyFees ?? 0) +
      (re.renovationFees ?? 0) +
      (re.furnishingFees ?? 0);

    const sortedMilestones = re.payment_schedule
      .filter((m) => m.due_date)
      .sort((a, b) => a.due_date.localeCompare(b.due_date));

    if (sortedMilestones.length > 0) {
      const first = sortedMilestones[0];
      addPoint(first.due_date, first.amount + totalFees, first.amount + totalFees);

      let cumulativePaid = 0;
      for (const milestone of sortedMilestones) {
        if (milestone.status === "paid") {
          cumulativePaid += milestone.amount;
          const cumulativeWithFees = cumulativePaid + totalFees;
          addPoint(milestone.due_date, cumulativeWithFees, cumulativeWithFees);
        }
      }
    }

    const marketValuation = re.market_valuation ?? currentValue;
    addPoint(snapshotDate, marketValuation, currentValue);
  } else {
    addPoint(snapshotDate, currentValue, currentValue);
  }

  const rows = Array.from(points.values());
  if (rows.length === 0) return;

  await supabase
    .from("asset_history")
    .upsert(rows, { onConflict: "asset_id,recorded_date" });
}

export async function addAsset(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to add an asset." };
  }

  const name = formData.get("name") as string;
  const categoryId = formData.get("category_id") as string;
  const quantity = formData.get("quantity") as string;
  const currentValue = formData.get("current_value") as string;
  const currency = (formData.get("currency") as string) || "USD";
  const images = parseImages(formData);
  const tickerSymbol = (formData.get("ticker_symbol") as string | null) || null;
  const purchaseDate = formData.get("purchase_date") as string;

  const metadataRaw = formData.get("metadata") as string | null;
  let metadata: Json = {};
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      return { error: "Invalid metadata payload." };
    }
  }

  const { data: inserted, error } = await supabase
    .from("assets")
    .insert({
      profile_id: user.id,
      category_id: categoryId,
      name,
      quantity: quantity ? Number(quantity) : 1,
      current_value: Number(currentValue),
      currency,
      metadata,
      images,
      ticker_symbol: tickerSymbol,
      purchase_date: purchaseDate,
    })
    .select("id, asset_categories(name)")
    .single<{ id: string; asset_categories: { name: string } | null }>();

  if (error) {
    return { error: error.message };
  }

  await syncAssetHistory(
    supabase,
    inserted.id,
    Number(currentValue),
    inserted.asset_categories?.name,
    metadata,
    purchaseDate,
  );

  revalidatePath("/dashboard");
}

export async function updateAsset(id: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to update an asset." };
  }

  const name = formData.get("name") as string;
  const categoryId = formData.get("category_id") as string;
  const quantity = formData.get("quantity") as string;
  const currentValue = formData.get("current_value") as string;
  const currency = (formData.get("currency") as string) || "USD";
  const images = parseImages(formData);
  const tickerSymbol = (formData.get("ticker_symbol") as string | null) || null;
  const purchaseDate = formData.get("purchase_date") as string;

  const metadataRaw = formData.get("metadata") as string | null;
  let metadata: Json = {};
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      return { error: "Invalid metadata payload." };
    }
  }

  const { data: updated, error } = await supabase
    .from("assets")
    .update({
      category_id: categoryId,
      name,
      quantity: quantity ? Number(quantity) : 1,
      current_value: Number(currentValue),
      currency,
      metadata,
      images,
      ticker_symbol: tickerSymbol,
      purchase_date: purchaseDate,
    })
    .eq("id", id)
    .eq("profile_id", user.id)
    .select("id, asset_categories(name)")
    .single<{ id: string; asset_categories: { name: string } | null }>();

  if (error) {
    return { error: error.message };
  }

  await syncAssetHistory(
    supabase,
    updated.id,
    Number(currentValue),
    updated.asset_categories?.name,
    metadata,
  );

  revalidatePath("/dashboard", "layout");
}

/**
 * Records a new valuation for a manual (non-live-priced) asset. `date`
 * defaults to today, but the Refresh Valuation dialog lets the user pick a
 * past date to back-populate the history curve — when they do, this only
 * inserts the `asset_history` point for that date; it deliberately does
 * NOT touch `assets.current_value`/`metadata`, since backdating adds a
 * historical data point rather than redefining what the asset is worth
 * right now. Only a same-day (today) valuation updates the live figures,
 * exactly as this action always behaved before the date picker existed.
 */
export async function updateAssetValuation(
  id: string,
  newValue: number,
  source: AssetHistorySource,
  date?: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to update a valuation." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{
      id: string;
      metadata: Json | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset) {
    return { error: "Asset not found." };
  }

  const isRealEstate = asset.asset_categories?.name === "Real Estate";
  const recordedDate = date || new Date().toISOString().slice(0, 10);
  const isToday = recordedDate === new Date().toISOString().slice(0, 10);

  let netEquity = newValue;
  let nextMetadata = asset.metadata;

  if (isRealEstate) {
    const reMetadata = parseRealEstateMetadata(asset.metadata);
    const loanPrincipal = reMetadata.linked_loan.amount ?? 0;
    const outstandingOffplan = reMetadata.is_offplan
      ? reMetadata.outstanding_balance
      : 0;

    netEquity = newValue - outstandingOffplan - loanPrincipal;
    nextMetadata = { ...reMetadata, market_valuation: newValue };
  }

  if (isToday) {
    const { error: updateError } = await supabase
      .from("assets")
      .update({ current_value: netEquity, metadata: nextMetadata })
      .eq("id", id)
      .eq("profile_id", user.id);

    if (updateError) {
      return { error: updateError.message };
    }
  }

  const { error: historyError } = await supabase.from("asset_history").upsert(
    {
      asset_id: id,
      recorded_date: recordedDate,
      value: newValue,
      net_equity: netEquity,
      source,
    },
    { onConflict: "asset_id,recorded_date" },
  );

  if (historyError) {
    return { error: historyError.message };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${id}`);
}

/**
 * CSV Bank Uploads (`tracker/CSV-Bank-Uploads.md`, Phase 1 Step 8) —
 * backend half only, built ahead of the upload UI. Takes rows already
 * parsed and validated by `parseBankCsvRows` (see `lib/bank-csv.ts`) and
 * upserts them into `asset_history` for one existing asset, same
 * `onConflict: "asset_id,recorded_date"` pattern as `syncAssetHistory`'s
 * auto-generated Real Estate timeline — a re-import regenerates rows in
 * place instead of duplicating them.
 *
 * `current_value` is set to whichever imported row has the latest
 * `recorded_date` (a CSV need not be in chronological order), matching
 * `updateAssetValuation`'s existing behavior of trusting the newest
 * recorded valuation. `net_equity` is set equal to `value` — correct for
 * a Cash-style account with no separate debt to subtract, same simplification
 * `syncAssetHistory` already makes for every non-Real-Estate category.
 */
export async function importBankCsvHistory(
  assetId: string,
  rows: ParsedBankCsvRow[],
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to import bank history." };
  }

  if (rows.length === 0) {
    return { error: "No valid rows to import." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{ id: string }>();

  if (!asset) {
    return { error: "Asset not found." };
  }

  const source: AssetHistorySource = "csv_import";

  const { error: historyError } = await supabase.from("asset_history").upsert(
    rows.map((row) => ({
      asset_id: assetId,
      recorded_date: row.recorded_date,
      value: row.value,
      net_equity: row.value,
      source,
    })),
    { onConflict: "asset_id,recorded_date" },
  );

  if (historyError) {
    return { error: historyError.message };
  }

  const latest = rows.reduce((latest, row) =>
    row.recorded_date > latest.recorded_date ? row : latest,
  );

  const { error: updateError } = await supabase
    .from("assets")
    .update({ current_value: latest.value })
    .eq("id", assetId)
    .eq("profile_id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);

  return { success: true as const, imported: rows.length };
}

export async function deleteAsset(id: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to delete an asset." };
  }

  const { error } = await supabase
    .from("assets")
    .delete()
    .eq("id", id)
    .eq("profile_id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard", "layout");
}

/**
 * Live Pricing (`tracker/Live-Pricing.md`, Phase 1 Step 9) — persists a
 * freshly-fetched unit price for an Equities/Crypto asset. Unlike
 * `updateAssetValuation` (which takes a total value the user typed
 * directly), this takes a *unit* price from `refresh-market-price` and
 * multiplies by the asset's own `quantity` to get the total, per this
 * note's requirement that a refresh update "quantity-based total value."
 * Writes `last_unit_price`/`last_priced_at`/`last_price_source` into
 * `metadata` (no dedicated DB columns for these — same
 * store-it-in-metadata pattern as Real Estate's `market_valuation`), and
 * `.upsert()`s the `asset_history` row (unlike `updateAssetValuation`'s
 * plain `.insert()`) since a live-price refresh is realistically triggered
 * more than once a day and would otherwise violate the
 * `(asset_id, recorded_date)` unique constraint on a same-day re-run.
 */
export async function refreshMarketPrice(
  id: string,
  unitPrice: number,
  source: AssetHistorySource,
) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to refresh a market price." };
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id, quantity, metadata")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<{ id: string; quantity: number; metadata: Json | null }>();

  if (!asset) {
    return { error: "Asset not found." };
  }

  const quantity = asset.quantity ?? 1;
  const totalValue = quantity * unitPrice;
  const now = new Date().toISOString();

  const existingMetadata =
    asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
      ? (asset.metadata as Record<string, Json>)
      : {};

  const nextMetadata: Json = {
    ...existingMetadata,
    last_unit_price: unitPrice,
    last_priced_at: now,
    last_price_source: source,
  };

  const { error: updateError } = await supabase
    .from("assets")
    .update({ current_value: totalValue, metadata: nextMetadata })
    .eq("id", id)
    .eq("profile_id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  const { error: historyError } = await supabase.from("asset_history").upsert(
    {
      asset_id: id,
      recorded_date: now.slice(0, 10),
      value: totalValue,
      net_equity: totalValue,
      source,
    },
    { onConflict: "asset_id,recorded_date" },
  );

  if (historyError) {
    return { error: historyError.message };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${id}`);

  return { success: true as const, unitPrice, totalValue, asOf: now };
}

/**
 * Weighted average cost of the buy lots in `trades`, used as a placeholder
 * unit price for `current_value` right after an import — the asset's real
 * live price is only known once "Refresh Market Price" (`refreshMarketPrice`
 * above) runs, so this is deliberately just "what was actually paid,"
 * never presented as a live quote. Falls back to the average price across
 * every trade (including sells) only when there are no buy lots at all —
 * an edge case (a sell-only import for an instrument this app has no prior
 * record of), not the common path.
 */
function estimateCostBasisUnitPrice(
  trades: { side: "buy" | "sell"; quantity: number; price: number }[],
): number | null {
  const buys = trades.filter((t) => t.side === "buy");
  const totalBuyQty = buys.reduce((sum, t) => sum + t.quantity, 0);
  if (totalBuyQty > 0) {
    const totalBuyCost = buys.reduce((sum, t) => sum + t.quantity * t.price, 0);
    return totalBuyCost / totalBuyQty;
  }

  const totalQty = trades.reduce((sum, t) => sum + t.quantity, 0);
  if (totalQty === 0) return null;
  const totalCost = trades.reduce((sum, t) => sum + t.quantity * t.price, 0);
  return totalCost / totalQty;
}

export type ImportBrokerTradesResult = {
  ticker: string;
  status: "created" | "updated" | "unchanged" | "error";
  message?: string;
};

/**
 * Broker Trade Import (Phase 2, `tracker/Broker-Trade-Import.md`) — persists
 * a broker parser's aggregated holdings (`aggregateTrades()` in
 * `lib/parsers/broker-registry.ts`) as Equities assets. For each holding:
 * finds an existing Equities asset with a matching `ticker_symbol` for this
 * user and appends only the genuinely new trades (deduped via `tradeId()`,
 * so re-uploading an export that overlaps a previous import doesn't
 * double-count), or creates a new asset if none exists. `current_value` is
 * set from `quantity × estimateCostBasisUnitPrice(...)` — cost basis, not a
 * live price, until "Refresh Market Price" is run. Processes every holding
 * independently and reports a per-ticker outcome, so one bad row doesn't
 * abort the whole batch.
 */
export async function importBrokerTrades(
  holdings: AggregatedHolding[],
): Promise<{ error: string } | { results: ImportBrokerTradesResult[] }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to import broker trades." };
  }

  const { data: equitiesCategory } = await supabase
    .from("asset_categories")
    .select("id")
    .eq("name", "Equities")
    .single<{ id: string }>();

  if (!equitiesCategory) {
    return { error: 'The "Equities" category is missing from this project.' };
  }

  const source: AssetHistorySource = "broker_import";
  const today = new Date().toISOString().slice(0, 10);
  const results: ImportBrokerTradesResult[] = [];

  for (const holding of holdings) {
    if (holding.trades.length === 0) {
      results.push({ ticker: holding.ticker, status: "unchanged" });
      continue;
    }

    const { data: existing } = await supabase
      .from("assets")
      .select("id, quantity, metadata")
      .eq("profile_id", user.id)
      .eq("category_id", equitiesCategory.id)
      .ilike("ticker_symbol", holding.ticker)
      .maybeSingle<{ id: string; quantity: number; metadata: Json | null }>();

    if (existing) {
      const existingMetadata = parseEquityMetadata(existing.metadata);
      const existingIds = new Set(existingMetadata.trades.map((t) => t.id));

      const newTrades: EquityTrade[] = holding.trades
        .filter((t) => !existingIds.has(tradeId(t)))
        .map((t) => ({
          id: tradeId(t),
          tradeDate: t.tradeDate,
          side: t.side,
          quantity: t.quantity,
          price: t.price,
          currency: t.currency,
          source,
          exchangeRate: t.exchangeRate,
          brokerage: t.brokerage,
        }));

      if (newTrades.length === 0) {
        results.push({ ticker: holding.ticker, status: "unchanged" });
        continue;
      }

      const quantityDelta = newTrades.reduce(
        (sum, t) => sum + (t.side === "buy" ? t.quantity : -t.quantity),
        0,
      );
      const newQuantity = existing.quantity + quantityDelta;

      const allTrades = [...existingMetadata.trades, ...newTrades];
      const unitPrice = existingMetadata.last_unit_price ?? estimateCostBasisUnitPrice(allTrades);
      const nextMetadata: Json = { ...existingMetadata, trades: allTrades };

      const updatePayload: { metadata: Json; quantity: number; current_value?: number } = {
        metadata: nextMetadata,
        quantity: newQuantity,
      };
      if (unitPrice != null) {
        updatePayload.current_value = Math.max(0, newQuantity) * unitPrice;
      }

      const { error: updateError } = await supabase
        .from("assets")
        .update(updatePayload)
        .eq("id", existing.id)
        .eq("profile_id", user.id);

      if (updateError) {
        results.push({ ticker: holding.ticker, status: "error", message: updateError.message });
        continue;
      }

      if (updatePayload.current_value != null) {
        await supabase.from("asset_history").upsert(
          {
            asset_id: existing.id,
            recorded_date: today,
            value: updatePayload.current_value,
            net_equity: updatePayload.current_value,
            source,
          },
          { onConflict: "asset_id,recorded_date" },
        );
      }

      results.push({ ticker: holding.ticker, status: "updated" });
    } else {
      const trades: EquityTrade[] = holding.trades.map((t) => ({
        id: tradeId(t),
        tradeDate: t.tradeDate,
        side: t.side,
        quantity: t.quantity,
        price: t.price,
        currency: t.currency,
        source,
        exchangeRate: t.exchangeRate,
        brokerage: t.brokerage,
      }));

      const unitPrice = estimateCostBasisUnitPrice(trades);
      const currentValue = unitPrice != null ? Math.max(0, holding.netQuantity) * unitPrice : 0;

      const metadata: Json = {
        exchange: holding.exchange ?? "",
        last_unit_price: null,
        last_priced_at: null,
        last_price_source: null,
        trades,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("assets")
        .insert({
          profile_id: user.id,
          category_id: equitiesCategory.id,
          name: holding.instrumentName,
          quantity: holding.netQuantity,
          current_value: currentValue,
          currency: holding.currency,
          ticker_symbol: holding.ticker,
          metadata,
        })
        .select("id")
        .single<{ id: string }>();

      if (insertError || !inserted) {
        results.push({
          ticker: holding.ticker,
          status: "error",
          message: insertError?.message ?? "Could not create this asset.",
        });
        continue;
      }

      await supabase.from("asset_history").upsert(
        {
          asset_id: inserted.id,
          recorded_date: today,
          value: currentValue,
          net_equity: currentValue,
          source,
        },
        { onConflict: "asset_id,recorded_date" },
      );

      results.push({ ticker: holding.ticker, status: "created" });
    }
  }

  revalidatePath("/dashboard", "layout");

  return { results };
}
