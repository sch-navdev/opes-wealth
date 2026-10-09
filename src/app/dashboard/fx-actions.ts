"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { isDemoUser } from "@/lib/demo-mode";
import { runFxRefresh } from "@/lib/fx-rates-refresh";

export type FxRefreshActionError =
  | "fxr_err_signed_out"
  | "fxr_err_mfa"
  | "fxr_err_demo"
  | "fxr_err_rate_limited"
  | "fxr_err_unavailable"
  | "fxr_err_failed";

export type FxRefreshActionResult =
  | { ok: true; currencies: number; source: "live" | "fallback" }
  | { ok: false; error: FxRefreshActionError };

/**
 * "Refresh now": fetches the live rates and stores today's (GST day) fixing for every currency, then
 * revalidates the dashboard. Gates as the other dashboard actions (session user, MFA step-up, demo
 * account refused). The write uses the service client (the tables are service-write only); the user
 * never supplies any value. Rate limit: refused when any run happened in the last 60 s.
 */
export async function refreshFxRatesNow(): Promise<FxRefreshActionResult> {
  try {
    const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
    const supabase = mockUserId ? createMockAdminClient() : await createClient();
    const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
    if (!user) return { ok: false, error: "fxr_err_signed_out" };
    if (!mockUserId && (await needsMfaStepUp(supabase))) return { ok: false, error: "fxr_err_mfa" };
    if (isDemoUser(user.id)) return { ok: false, error: "fxr_err_demo" };

    let db: SupabaseClient;
    try {
      db = createServiceClient() as unknown as SupabaseClient;
    } catch {
      return { ok: false, error: "fxr_err_unavailable" };
    }

    const { data: last, error: lastError } = await db
      .from("fx_rate_runs")
      .select("ran_at")
      .order("ran_at", { ascending: false })
      .limit(1);
    if (lastError) return { ok: false, error: "fxr_err_unavailable" };
    const lastAt = last?.[0]?.ran_at ? Date.parse(String(last[0].ran_at)) : NaN;
    if (!Number.isNaN(lastAt) && Date.now() - lastAt < 60_000) {
      return { ok: false, error: "fxr_err_rate_limited" };
    }

    const result = await runFxRefresh(db, "manual");
    if (!result.ok) {
      return { ok: false, error: result.errorCode === "table_missing" ? "fxr_err_unavailable" : "fxr_err_failed" };
    }
    revalidatePath("/dashboard", "layout");
    return { ok: true, currencies: result.currencies, source: result.source };
  } catch {
    return { ok: false, error: "fxr_err_failed" };
  }
}
