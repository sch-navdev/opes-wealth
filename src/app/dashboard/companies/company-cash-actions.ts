"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { isDemoUser } from "@/lib/demo-mode";
import { withCompanyId } from "@/lib/company-cash";
import type { Json } from "@/types/supabase";

export type CompanyCashErrorCode =
  | "cco_err_signed_out"
  | "cco_err_mfa"
  | "cco_err_invalid"
  | "cco_err_account_not_found"
  | "cco_err_company_not_found"
  | "cco_err_co_owned"
  | "cco_err_save_failed";

export type SetBankAccountCompanyResult =
  | { ok: true; companyId: string | null }
  | { ok: false; error: CompanyCashErrorCode };

function categoryName(raw: unknown): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string"
    ? (v as { name: string }).name
    : null;
}

/**
 * Links a Cash account to one of the caller's Company entities (`metadata.company_id`) or, with `companyId`
 * null / empty, makes it a personal account again. See `lib/company-cash.ts` for what the link means. The
 * account stays a Cash asset, so statement import, history and balances are untouched and no history row is
 * written: only the metadata changes, and it is MERGED (every other key kept as stored).
 *
 * Gates (same as the other dashboard actions): user from the session, MFA step-up, dev-only mock auth, every
 * query scoped to the user. The account must be the caller's OWN active non-liability Cash asset and not
 * co-owned with anybody else (an edit would need the co-owners' approval, not supported here); the company
 * must be the caller's own active Companies asset. The demo account is read-only: success is reported, nothing
 * is written.
 */
export async function setBankAccountCompany(
  assetId: string,
  companyId: string | null,
): Promise<SetBankAccountCompanyResult> {
  try {
    const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
    const supabase = mockUserId ? createMockAdminClient() : await createClient();
    const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
    if (!user) return { ok: false, error: "cco_err_signed_out" };
    if (!mockUserId && (await needsMfaStepUp(supabase))) return { ok: false, error: "cco_err_mfa" };

    const target = typeof companyId === "string" ? companyId.trim() : "";
    if (typeof assetId !== "string" || !assetId.trim() || (companyId != null && typeof companyId !== "string")) {
      return { ok: false, error: "cco_err_invalid" };
    }
    const db = supabase as unknown as SupabaseClient;

    const { data: account, error: accountError } = await db
      .from("assets")
      .select("id, is_liability, metadata, asset_categories(name)")
      .eq("id", assetId)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (accountError) return { ok: false, error: "cco_err_save_failed" };
    const acc = account as { is_liability: boolean | null; metadata: unknown; asset_categories?: unknown } | null;
    if (!acc || acc.is_liability || categoryName(acc.asset_categories) !== "Cash") {
      return { ok: false, error: "cco_err_account_not_found" };
    }

    if (target) {
      const { data: company, error: companyError } = await db
        .from("assets")
        .select("id, asset_categories(name)")
        .eq("id", target)
        .eq("profile_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (companyError) return { ok: false, error: "cco_err_save_failed" };
      const co = company as { asset_categories?: unknown } | null;
      if (!co || categoryName(co.asset_categories) !== "Companies") {
        return { ok: false, error: "cco_err_company_not_found" };
      }
    }

    const { data: owners, error: ownersError } = await db
      .from("asset_owners")
      .select("profile_id")
      .eq("asset_id", assetId);
    if (ownersError && (ownersError as { code?: string }).code !== "PGRST205") {
      return { ok: false, error: "cco_err_save_failed" }; // fail closed; PGRST205 = co-ownership not installed
    }
    if (((owners ?? []) as { profile_id: string | null }[]).some((o) => o.profile_id !== user.id)) {
      return { ok: false, error: "cco_err_co_owned" };
    }

    if (isDemoUser(user.id)) return { ok: true, companyId: target || null };

    const metadata = withCompanyId(acc.metadata, target || null);
    const { data: updated, error: updateError } = await db
      .from("assets")
      .update({ metadata: metadata as Json })
      .eq("id", assetId)
      .eq("profile_id", user.id)
      .select("id");
    if (updateError || !updated || (updated as unknown[]).length === 0) {
      return { ok: false, error: "cco_err_save_failed" };
    }

    // Net worth is unchanged; the link moves the account between the personal and the company views.
    revalidatePath("/dashboard", "layout");
    return { ok: true, companyId: target || null };
  } catch {
    return { ok: false, error: "cco_err_save_failed" };
  }
}
