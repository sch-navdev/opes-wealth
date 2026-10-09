"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { cleanSourceRef, isMissingColumnError } from "@/lib/asset-history";
import { fingerprintTransactions, type ImportTransaction } from "@/lib/transactions";

const BATCH = 500;
/** 64-char hashes in a URL query: keep each `in (...)` list well under typical URL limits. */
const CHECK_CHUNK = 150;

function isValidTransaction(t: ImportTransaction): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount);
}

export type ImportTransactionsResult =
  | { success: true; inserted: number; duplicates: number }
  | { error: string };

/**
 * Persists a CSV/statement's individual transactions for one Cash account,
 * upserting on `(profile_id, fingerprint)` so re-importing the same or an
 * overlapping file inserts only the genuinely new ones and reports how many
 * were already there. Called after `importBankCsvHistory` (which writes the
 * balance history); the two are independent — a failure here never undoes the
 * balance import.
 *
 * Needs migration 0022 (`transactions`). Until it is applied the call returns
 * an error string and the balance import still stands.
 */
export async function importBankTransactions(
  assetId: string,
  transactions: ImportTransaction[],
  source: "csv_import" | "pdf_import" = "csv_import",
  fileName?: string,
): Promise<ImportTransactionsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to import transactions." };
  if (transactions.length === 0) return { success: true, inserted: 0, duplicates: 0 };

  const { data: asset } = await supabase
    .from("assets")
    .select("id, currency")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{ id: string; currency: string }>();
  if (!asset) return { error: "Asset not found." };

  const valid = transactions.filter(isValidTransaction);
  const sourceFile = cleanSourceRef(fileName);
  const rows = fingerprintTransactions(valid, asset.currency).map((t) => ({
    profile_id: user.id,
    asset_id: assetId,
    fingerprint: t.fingerprint,
    booked_date: t.date,
    amount: t.amount,
    currency: t.currency,
    description: t.description,
    source: source === "pdf_import" ? "pdf_import" : "csv_import",
    ...(sourceFile ? { source_file: sourceFile } : {}),
  }));

  let inserted = 0;
  let keepFile = true;
  for (let i = 0; i < rows.length; i += BATCH) {
    const upsert = (withFile: boolean) =>
      supabase
        .from("transactions")
        .upsert(
          rows.slice(i, i + BATCH).map((r) => {
            if (withFile) return r;
            const { source_file: _file, ...rest } = r as typeof r & { source_file?: string };
            void _file;
            return rest;
          }),
          { onConflict: "profile_id,fingerprint", ignoreDuplicates: true },
        )
        .select("id");
    let { data, error } = await upsert(keepFile);
    // Migration 0041 not applied yet: the file name cannot be stored, the transactions still can.
    if (isMissingColumnError(error, "source_file")) {
      keepFile = false;
      ({ data, error } = await upsert(false));
    }
    if (error) return { error: error.message };
    inserted += data?.length ?? 0;
  }

  revalidatePath(`/dashboard/assets/${assetId}`);
  return { success: true, inserted, duplicates: rows.length - inserted };
}

export type CheckExistingResult = { success: true; existing: boolean[] } | { error: string };

/**
 * Read-only duplicate check for the import preview: for each input transaction, whether a stored
 * transaction of this profile already has the same fingerprint. Fingerprints are computed exactly as
 * `importBankTransactions` does (same validity filter, same asset currency, same occurrence
 * numbering over the list), so pass the WHOLE file's rows for the group, in file order. Invalid rows
 * (bad date / amount) are reported as not existing. Needs migration 0022; without the table it returns
 * `{ error }` and the dialog treats the state as unknown (it never blocks the import).
 */
export async function checkExistingTransactions(
  assetId: string,
  transactions: ImportTransaction[],
): Promise<CheckExistingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to check transactions." };
  if (transactions.length === 0) return { success: true, existing: [] };

  const { data: asset } = await supabase
    .from("assets")
    .select("id, currency")
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .single<{ id: string; currency: string }>();
  if (!asset) return { error: "Asset not found." };

  const validIndexes: number[] = [];
  const valid: ImportTransaction[] = [];
  transactions.forEach((t, i) => {
    if (isValidTransaction(t)) {
      validIndexes.push(i);
      valid.push(t);
    }
  });
  const fingerprints = fingerprintTransactions(valid, asset.currency).map((t) => t.fingerprint);

  const found = new Set<string>();
  const unique = Array.from(new Set(fingerprints));
  for (let i = 0; i < unique.length; i += CHECK_CHUNK) {
    const { data, error } = await supabase
      .from("transactions")
      .select("fingerprint")
      .eq("profile_id", user.id)
      .in("fingerprint", unique.slice(i, i + CHECK_CHUNK));
    if (error) return { error: error.message };
    for (const row of (data ?? []) as { fingerprint: string }[]) found.add(row.fingerprint);
  }

  const existing = transactions.map(() => false);
  validIndexes.forEach((originalIndex, k) => {
    existing[originalIndex] = found.has(fingerprints[k]);
  });
  return { success: true, existing };
}
