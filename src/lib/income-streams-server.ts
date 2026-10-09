/**
 * Reads the signed-in user's income streams (`public.income_streams`, migration 0037). Takes the
 * Supabase client as a parameter (the page's own, mock-auth included). The generated DB types predate
 * the migration, so the table is reached through the untyped client. Never throws: while the migration
 * is not applied (42P01 / PGRST205 "relation does not exist") it reports `available: false`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseIncomeStreamRow, type IncomeStream } from "@/lib/income-streams";

/** True for "the income_streams table is not there yet". */
export function isMissingIncomeStreamsTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    (/income_streams/i.test(e.message ?? "") && /does not exist|schema cache|could not find/i.test(e.message ?? ""))
  );
}

export type IncomeStreamsLoad = { streams: IncomeStream[]; available: boolean };

export async function loadIncomeStreams(client: unknown, userId: string): Promise<IncomeStreamsLoad> {
  try {
    const { data, error } = await (client as SupabaseClient)
      .from("income_streams")
      .select("id, kind, label, source_name, amount, currency, frequency, pay_day, pay_month, start_date, end_date, notes")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true });
    if (error) return { streams: [], available: !isMissingIncomeStreamsTable(error) };
    const streams = ((data ?? []) as unknown[]).map(parseIncomeStreamRow).filter((s): s is IncomeStream => s !== null);
    return { streams, available: true };
  } catch {
    return { streams: [], available: false };
  }
}
