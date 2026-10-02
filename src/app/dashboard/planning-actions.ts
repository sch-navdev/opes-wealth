"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { parsePlan, type PlanInputs } from "@/lib/planning";
import type { Json } from "@/types/supabase";

/** Saves a simulated project's financing plan (Day D, LTV, rate, term, own cash). Owner only, simulations only. */
export async function savePlan(assetId: string, plan: PlanInputs): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const clean = parsePlan(plan);
  const { data, error } = await supabase
    .from("assets")
    .update({ plan: clean as unknown as Json })
    .eq("id", assetId)
    .eq("profile_id", user.id)
    .eq("status", "simulation")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Project not found." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
