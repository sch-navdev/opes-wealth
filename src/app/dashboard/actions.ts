"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
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

  const { error } = await supabase.from("assets").insert({
    profile_id: user.id,
    category_id: categoryId,
    name,
    quantity: quantity ? Number(quantity) : 1,
    current_value: Number(currentValue),
    currency,
    metadata,
    images,
  });

  if (error) {
    return { error: error.message };
  }

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

  const { error } = await supabase
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
    .eq("profile_id", user.id);

  if (error) {
    return { error: error.message };
  }

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
