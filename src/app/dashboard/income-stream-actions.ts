"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { isDemoUser } from "@/lib/demo-mode";
import { validateIncomeStream, type IncomeStreamError } from "@/lib/income-streams";
import { isMissingIncomeStreamsTable } from "@/lib/income-streams-server";

export type IncomeStreamActionError =
  | IncomeStreamError
  | "cf_err_signed_out"
  | "cf_err_mfa"
  | "cf_err_demo"
  | "cf_err_not_found"
  | "cf_err_save_failed"
  | "cf_err_unavailable";

export type IncomeStreamResult = { ok: true; id?: string } | { ok: false; error: IncomeStreamActionError };

type Gate = { ok: true; db: SupabaseClient; userId: string } | { ok: false; error: IncomeStreamActionError };

/**
 * Same gates as the other dashboard actions: the user comes from the session (never from the
 * arguments), MFA step-up, dev-only mock auth, and the demo account is refused (read-only). Every
 * query below is also scoped to the user explicitly (the mock client bypasses RLS). Income streams
 * are private to their owner: there is no co-owner logic.
 */
async function gate(): Promise<Gate> {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, error: "cf_err_signed_out" };
  if (!mockUserId && (await needsMfaStepUp(supabase))) return { ok: false, error: "cf_err_mfa" };
  if (isDemoUser(user.id)) return { ok: false, error: "cf_err_demo" };
  return { ok: true, db: supabase as unknown as SupabaseClient, userId: user.id };
}

function failure(error: unknown): IncomeStreamResult {
  return { ok: false, error: isMissingIncomeStreamsTable(error) ? "cf_err_unavailable" : "cf_err_save_failed" };
}

const isId = (id: unknown): id is string => typeof id === "string" && id.trim().length > 0 && id.length <= 64;

export async function createIncomeStream(input: unknown): Promise<IncomeStreamResult> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    const v = validateIncomeStream(input);
    if (!v.ok) return v;
    const { data, error } = await g.db
      .from("income_streams")
      .insert({ ...v.value, profile_id: g.userId })
      .select("id")
      .single();
    if (error) return failure(error);
    revalidatePath("/dashboard", "layout");
    return { ok: true, id: (data as { id?: string } | null)?.id };
  } catch {
    return { ok: false, error: "cf_err_save_failed" };
  }
}

export async function updateIncomeStream(id: string, input: unknown): Promise<IncomeStreamResult> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    if (!isId(id)) return { ok: false, error: "cf_err_not_found" };
    const v = validateIncomeStream(input);
    if (!v.ok) return v;
    const { data, error } = await g.db
      .from("income_streams")
      .update({ ...v.value, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("profile_id", g.userId)
      .select("id");
    if (error) return failure(error);
    if (!data || data.length === 0) return { ok: false, error: "cf_err_not_found" };
    revalidatePath("/dashboard", "layout");
    return { ok: true, id };
  } catch {
    return { ok: false, error: "cf_err_save_failed" };
  }
}

export async function deleteIncomeStream(id: string): Promise<IncomeStreamResult> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    if (!isId(id)) return { ok: false, error: "cf_err_not_found" };
    const { data, error } = await g.db
      .from("income_streams")
      .delete()
      .eq("id", id)
      .eq("profile_id", g.userId)
      .select("id");
    if (error) return failure(error);
    if (!data || data.length === 0) return { ok: false, error: "cf_err_not_found" };
    revalidatePath("/dashboard", "layout");
    return { ok: true, id };
  } catch {
    return { ok: false, error: "cf_err_save_failed" };
  }
}
