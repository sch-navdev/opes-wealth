/**
 * Reads the signed-in user's end-of-service plans (`public.end_of_service_plans`, draft migration
 * 0040). Takes the Supabase client as a parameter and reaches the table through the untyped client.
 * Never throws: while the table is missing (42P01 / PGRST205) it reports `available: false`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePlanRow, type EndOfServicePlan } from "@/lib/uae-gratuity";

export function isMissingGratuityTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    e.code === "PGRST205" ||
    (/end_of_service_plans/i.test(e.message ?? "") && /does not exist|schema cache|could not find/i.test(e.message ?? ""))
  );
}

export type GratuityLoad = { plans: EndOfServicePlan[]; available: boolean };

export async function loadGratuityPlans(client: unknown, userId: string): Promise<GratuityLoad> {
  try {
    const { data, error } = await (client as SupabaseClient)
      .from("end_of_service_plans")
      .select(
        "id, employer, start_date, end_date, contract_type, unpaid_leave_days, wage_history, payments, employer_stated_balance, currency, notes",
      )
      .eq("profile_id", userId)
      .order("created_at", { ascending: true });
    if (error) return { plans: [], available: !isMissingGratuityTable(error) };
    const plans = ((data ?? []) as unknown[]).map(parsePlanRow).filter((p): p is EndOfServicePlan => p !== null);
    return { plans, available: true };
  } catch {
    return { plans: [], available: false };
  }
}
