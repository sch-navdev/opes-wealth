"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { isDemoUser } from "@/lib/demo-mode";
import { validatePlan, type PlanError } from "@/lib/uae-gratuity";
import { isMissingGratuityTable } from "@/lib/gratuity-server";

export type GratuityActionError =
  | PlanError
  | "grat_err_signed_out"
  | "grat_err_mfa"
  | "grat_err_demo"
  | "grat_err_not_found"
  | "grat_err_save_failed"
  | "grat_err_unavailable";

export type GratuityActionResult = { ok: true; id?: string } | { ok: false; error: GratuityActionError };

type Gate = { ok: true; db: SupabaseClient; userId: string } | { ok: false; error: GratuityActionError };

/** Session user (never from arguments), MFA step-up, dev-only mock auth, demo refused. */
async function gate(): Promise<Gate> {
  const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
  const supabase = mockUserId ? createMockAdminClient() : await createClient();
  const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, error: "grat_err_signed_out" };
  if (!mockUserId && (await needsMfaStepUp(supabase))) return { ok: false, error: "grat_err_mfa" };
  if (isDemoUser(user.id)) return { ok: false, error: "grat_err_demo" };
  return { ok: true, db: supabase as unknown as SupabaseClient, userId: user.id };
}

function failure(error: unknown): GratuityActionResult {
  return { ok: false, error: isMissingGratuityTable(error) ? "grat_err_unavailable" : "grat_err_save_failed" };
}

const isId = (id: unknown): id is string => typeof id === "string" && id.trim().length > 0 && id.length <= 64;

export async function createGratuityPlan(input: unknown): Promise<GratuityActionResult> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    const v = validatePlan(input);
    if (!v.ok) return v;
    const { data, error } = await g.db
      .from("end_of_service_plans")
      .insert({ ...v.value, profile_id: g.userId })
      .select("id")
      .single();
    if (error) return failure(error);
    revalidatePath("/dashboard", "layout");
    return { ok: true, id: (data as { id?: string } | null)?.id };
  } catch {
    return { ok: false, error: "grat_err_save_failed" };
  }
}

export async function updateGratuityPlan(id: string, input: unknown): Promise<GratuityActionResult> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    if (!isId(id)) return { ok: false, error: "grat_err_not_found" };
    const v = validatePlan(input);
    if (!v.ok) return v;
    const { data, error } = await g.db
      .from("end_of_service_plans")
      .update({ ...v.value, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("profile_id", g.userId)
      .select("id");
    if (error) return failure(error);
    if (!data || data.length === 0) return { ok: false, error: "grat_err_not_found" };
    revalidatePath("/dashboard", "layout");
    return { ok: true, id };
  } catch {
    return { ok: false, error: "grat_err_save_failed" };
  }
}

export async function deleteGratuityPlan(id: string): Promise<GratuityActionResult> {
  try {
    const g = await gate();
    if (!g.ok) return g;
    if (!isId(id)) return { ok: false, error: "grat_err_not_found" };
    const { data, error } = await g.db
      .from("end_of_service_plans")
      .delete()
      .eq("id", id)
      .eq("profile_id", g.userId)
      .select("id");
    if (error) return failure(error);
    if (!data || data.length === 0) return { ok: false, error: "grat_err_not_found" };
    revalidatePath("/dashboard", "layout");
    return { ok: true, id };
  } catch {
    return { ok: false, error: "grat_err_save_failed" };
  }
}
