"use server";

import { revalidatePath } from "next/cache";
import { pdfToText } from "@/lib/pdf-text";
import { createClient } from "@/utils/supabase/server";
import { syncAssetHistory } from "@/lib/asset-history-sync";
import { parseBlueBookText, type ParsedBlueBook } from "@/lib/bluebook-parser";
import { convertAmount, getExchangeRatesFromUsd } from "@/lib/fx";
import { currencies } from "@/lib/currencies";
import { nextBlueBookId, parseVehicleMetadata, type VehicleMetadata } from "@/lib/vehicles";
import type { Json } from "@/types/supabase";

const MAX_PDF_BYTES = 8 * 1024 * 1024;

export type ReadBlueBookResult =
  | { ok: true; fileName: string; parsed: ParsedBlueBook }
  | { ok: false; error: string; detail?: string };

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
    text = await pdfToText(await file.arrayBuffer());
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("readBlueBookDocument: pdf-parse failed:", detail);
    return { ok: false, error: "bluebook_error_read", detail: detail.slice(0, 160) };
  }

  const parsed = parseBlueBookText(text);
  if (parsed.value == null && !parsed.source && !parsed.date) return { ok: false, error: "bluebook_error_nothing" };
  return { ok: true, fileName: file.name, parsed };
}

export type SaveBlueBookInput = {
  /** In `currency`. */
  amount: number;
  /** ISO 4217 code of the document's currency. */
  currency: string;
  source: string;
  /** ISO YYYY-MM-DD */
  date: string;
  documentName: string;
  /** Also make this the asset's current value (converted to the asset's currency) and log it in the history. */
  applyAsCurrent: boolean;
};

type OwnVehicle = { id: string; currency: string; metadata: Json | null; asset_categories: { name: string } | null };

async function loadOwnVehicle(assetId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "You must be signed in." };
  const { data: asset } = await supabase
    .from("assets")
    .select("id, currency, metadata, asset_categories(name)")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<OwnVehicle>();
  if (!asset || asset.asset_categories?.name !== "Vehicles") return { ok: false as const, error: "Vehicle not found." };
  return { ok: true as const, supabase, userId: user.id, asset };
}

/** Adds an official valuation to the vehicle's Blue Book log (creator only), optionally as its current value. */
export async function saveBlueBookValuation(
  assetId: string,
  input: SaveBlueBookInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: "bluebook_error_value" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "bluebook_error_date" };
  if (!currencies.some((c) => c.code === input.currency)) return { ok: false, error: "bluebook_error_currency" };

  const loaded = await loadOwnVehicle(assetId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { supabase, userId, asset } = loaded;

  const current = parseVehicleMetadata(asset.metadata);
  const entry = {
    id: nextBlueBookId(),
    date: input.date,
    amount: input.amount,
    currency: input.currency,
    source: input.source.trim().slice(0, 80),
    document: input.documentName.slice(0, 160),
  };
  const metadata: VehicleMetadata = {
    ...current,
    // The pre-log single value has been migrated into the log on read; clear it.
    blue_book_value: null,
    blue_book_source: "",
    blue_book_date: "",
    blue_book_document: "",
    blue_book_log: [...current.blue_book_log, entry].sort((a, b) => a.date.localeCompare(b.date)),
  };

  let currentValue: number | null = null;
  if (input.applyAsCurrent) {
    const rates = await getExchangeRatesFromUsd();
    currentValue = Math.round(convertAmount(input.amount, input.currency, asset.currency, rates) * 100) / 100;
  }

  const { error } = await supabase
    .from("assets")
    .update({ metadata: metadata as unknown as Json, ...(currentValue != null ? { current_value: currentValue } : {}) })
    .eq("id", assetId)
    .eq("profile_id", userId);
  if (error) return { ok: false, error: error.message };

  if (currentValue != null) {
    await syncAssetHistory(supabase, assetId, currentValue, "Vehicles", metadata as unknown as Json);
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
  return { ok: true };
}

/** Removes one wrong or duplicate official valuation from the log. */
export async function deleteBlueBookEntry(assetId: string, entryId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadOwnVehicle(assetId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { supabase, userId, asset } = loaded;

  const current = parseVehicleMetadata(asset.metadata);
  const metadata: VehicleMetadata = {
    ...current,
    blue_book_value: null,
    blue_book_source: "",
    blue_book_date: "",
    blue_book_document: "",
    blue_book_log: current.blue_book_log.filter((e) => e.id !== entryId),
  };
  const { error } = await supabase
    .from("assets")
    .update({ metadata: metadata as unknown as Json })
    .eq("id", assetId)
    .eq("profile_id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
  return { ok: true };
}
