"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseRealEstateMetadata } from "@/lib/real-estate";

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
 * due date (the purchase/contract date — there's no separate purchase-date
 * field, so for off-plan Real Estate this is the down payment milestone),
 * one point per "paid" milestone with the cumulative paid-to-date amount up
 * to that date, and a point for today's market valuation. Since there's no
 * recorded historical market valuation at each past date, the historical
 * points use cumulative cash invested (paid milestones + fees) for both
 * `value` and `net_equity` — a deliberate simplification flagged in the
 * tracker notes, not a claim that net equity equals cash invested in
 * general. Upserts on (asset_id, recorded_date) so re-saving the form
 * regenerates the same points instead of duplicating them.
 */
async function syncAssetHistory(
  supabase: SupabaseClient,
  assetId: string,
  currentValue: number,
  categoryName: string | null | undefined,
  metadata: Record<string, unknown>,
) {
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
      (re.adm_fee_amount ?? 0) +
      (re.notaryFees ?? 0) +
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
    addPoint(new Date().toISOString().slice(0, 10), marketValuation, currentValue);
  } else {
    addPoint(new Date().toISOString().slice(0, 10), currentValue, currentValue);
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

  const metadataRaw = formData.get("metadata") as string | null;
  let metadata: Record<string, unknown> = {};
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

  const metadataRaw = formData.get("metadata") as string | null;
  let metadata: Record<string, unknown> = {};
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

export async function updateAssetValuation(
  id: string,
  newValue: number,
  source: "manual" | "dari" | "dubailand",
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
      metadata: Record<string, unknown> | null;
      asset_categories: { name: string } | null;
    }>();

  if (!asset) {
    return { error: "Asset not found." };
  }

  const isRealEstate = asset.asset_categories?.name === "Real Estate";

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

  const { error: updateError } = await supabase
    .from("assets")
    .update({ current_value: netEquity, metadata: nextMetadata })
    .eq("id", id)
    .eq("profile_id", user.id);

  if (updateError) {
    return { error: updateError.message };
  }

  const { error: historyError } = await supabase.from("asset_history").insert({
    asset_id: id,
    recorded_date: new Date().toISOString().slice(0, 10),
    value: newValue,
    net_equity: netEquity,
    source,
  });

  if (historyError) {
    return { error: historyError.message };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${id}`);
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
