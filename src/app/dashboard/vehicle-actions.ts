"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { syncAssetHistory } from "@/lib/asset-history-sync";
import { parseBlueBookText, type ParsedBlueBook } from "@/lib/bluebook-parser";
import { parseVehicleMetadata } from "@/lib/vehicles";
import type { Json } from "@/types/supabase";

const MAX_PDF_BYTES = 8 * 1024 * 1024;

export type ReadBlueBookResult =
  | { ok: true; fileName: string; parsed: ParsedBlueBook }
  | { ok: false; error: string };

/**
 * Reads an uploaded official valuation PDF and returns what it found. Nothing is
 * saved: the dialog shows the result for the user to confirm or correct first.
 */
export async function readBlueBookDocument(formData: FormData): Promise<ReadBlueBookResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file was uploaded." };
  if (!file.name.toLowerCase().endsWith(".pdf")) return { ok: false, error: "bluebook_error_type" };
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: "bluebook_error_size" };

  let text: string;
  try {
    const pdfParse = (await import("pdf-parse")).default;
    text = (await pdfParse(Buffer.from(await file.arrayBuffer()))).text;
  } catch {
    return { ok: false, error: "bluebook_error_read" };
  }

  const parsed = parseBlueBookText(text);
  if (parsed.value == null && !parsed.source && !parsed.date) return { ok: false, error: "bluebook_error_nothing" };
  return { ok: true, fileName: file.name, parsed };
}

export type SaveBlueBookInput = {
  value: number;
  source: string;
  /** ISO YYYY-MM-DD */
  date: string;
  documentName: string;
  /** Also make this the asset's current value (and log it in the history). */
  applyAsCurrent: boolean;
};

/** Stores the official valuation on a vehicle (creator only), optionally as its current value. */
export async function saveBlueBookValuation(
  assetId: string,
  input: SaveBlueBookInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  if (!Number.isFinite(input.value) || input.value <= 0) return { ok: false, error: "bluebook_error_value" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "bluebook_error_date" };

  const { data: asset } = await supabase
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{ id: string; metadata: Json | null; asset_categories: { name: string } | null }>();
  if (!asset || asset.asset_categories?.name !== "Vehicles") return { ok: false, error: "Vehicle not found." };

  const metadata = {
    ...parseVehicleMetadata(asset.metadata),
    blue_book_value: input.value,
    blue_book_source: input.source.trim().slice(0, 80),
    blue_book_date: input.date,
    blue_book_document: input.documentName.slice(0, 160),
  };

  const { error } = await supabase
    .from("assets")
    .update({ metadata: metadata as unknown as Json, ...(input.applyAsCurrent ? { current_value: input.value } : {}) })
    .eq("id", assetId)
    .eq("profile_id", user.id);
  if (error) return { ok: false, error: error.message };

  if (input.applyAsCurrent) {
    await syncAssetHistory(supabase, assetId, input.value, "Vehicles", metadata as unknown as Json);
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
  return { ok: true };
}
