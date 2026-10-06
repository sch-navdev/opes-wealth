"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { fingerprintTransactions, type ImportTransaction } from "@/lib/transactions";

const BATCH = 500;

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

  const valid = transactions.filter(
    (t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount),
  );
  const rows = fingerprintTransactions(valid, asset.currency).map((t) => ({
    profile_id: user.id,
    asset_id: assetId,
    fingerprint: t.fingerprint,
    booked_date: t.date,
    amount: t.amount,
    currency: t.currency,
    description: t.description,
    source: source === "pdf_import" ? "pdf_import" : "csv_import",
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { data, error } = await supabase
      .from("transactions")
      .upsert(rows.slice(i, i + BATCH), {
        onConflict: "profile_id,fingerprint",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) return { error: error.message };
    inserted += data?.length ?? 0;
  }

  revalidatePath(`/dashboard/assets/${assetId}`);
  return { success: true, inserted, duplicates: rows.length - inserted };
}
