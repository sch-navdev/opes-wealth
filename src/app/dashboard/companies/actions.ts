"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { isDemoUser } from "@/lib/demo-mode";
import { sanitizeHeldAssetIds } from "@/lib/companies";
import { COMPANIES_CATEGORY } from "@/lib/entity-lookthrough";
import { loadCoOwnedAssets } from "@/lib/shared-assets/load";
import type { TranslationKey } from "@/lib/i18n";
import type { Json } from "@/types/supabase";

export type SetEntityHeldAssetsResult =
  | {
      ok: true;
      /** What is now stored on the entity (`metadata.held_asset_ids`). */
      heldAssetIds: string[];
      /** Requested ids that were dropped (not visible to the caller, a Company, the entity itself). */
      skipped: number;
    }
  | { ok: false; error: TranslationKey };

/** More than any real portfolio: bounds the work a single (untrusted) request can ask for. */
const MAX_IDS = 1000;

type AssetRef = { id: string; asset_categories: { name: string } | null };

/** PostgREST may return a joined row as an object or as a one-element array: always an object (or null). */
function categoryOf(raw: unknown): { name: string } | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string" ? (v as { name: string }) : null;
}
function toRefs(rows: unknown): AssetRef[] {
  return ((rows ?? []) as { id: string; asset_categories?: unknown }[]).map((r) => ({ id: r.id, asset_categories: categoryOf(r.asset_categories) }));
}

/**
 * Sets which non-Company assets / liabilities are held through an entity (a
 * Companies asset): `metadata.held_asset_ids`, a reporting link only (see
 * `lib/entity-lookthrough.ts`); no value changes, so no history row.
 *
 * Same gates as the other dashboard actions: the user comes from the session
 * (never from the arguments), MFA step-up, dev-only mock auth (hard-gated on
 * NODE_ENV, service-role client, so every query below is scoped to the user
 * explicitly). Rules:
 *  - the entity must be the caller's OWN active Companies asset;
 *  - v1: an entity with other owners (co-ownership rows) is refused rather than
 *    bypassing the approval flow;
 *  - the ids are filtered to non-Company assets the caller can see (own + co-owned,
 *    active), the entity itself excluded; order kept, duplicates dropped;
 *  - the metadata is MERGED: every other key is kept as stored;
 *  - the demo account is read-only: nothing is written and success is reported,
 *    as the demo client shim does for every other write.
 */
export async function setEntityHeldAssets(entityId: string, assetIds: string[]): Promise<SetEntityHeldAssetsResult> {
  try {
    const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
    const supabase = mockUserId ? createMockAdminClient() : await createClient();
    const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
    if (!user) return { ok: false, error: "ent_err_signed_out" };
    if (!mockUserId && (await needsMfaStepUp(supabase))) return { ok: false, error: "ent_err_mfa" };

    if (typeof entityId !== "string" || !entityId.trim() || !Array.isArray(assetIds) || assetIds.length > MAX_IDS) {
      return { ok: false, error: "ent_err_invalid" };
    }
    const requested = sanitizeHeldAssetIds(assetIds);
    const db = supabase as unknown as SupabaseClient;

    const { data: entity, error: entityError } = await db
      .from("assets")
      .select("id, metadata, asset_categories(name)")
      .eq("id", entityId)
      .eq("profile_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (entityError) return { ok: false, error: "ent_err_save_failed" };
    const entityRaw = entity as { metadata: Record<string, unknown> | null; asset_categories?: unknown } | null;
    const entityRow = entityRaw && { metadata: entityRaw.metadata, category: categoryOf(entityRaw.asset_categories) };
    if (!entityRow || entityRow.category?.name !== COMPANIES_CATEGORY) {
      return { ok: false, error: "ent_err_not_found" };
    }

    // Co-owned entity: an edit would have to go through the co-owners' approval flow (not supported in v1).
    const { data: owners, error: ownersError } = await db
      .from("asset_owners")
      .select("profile_id")
      .eq("asset_id", entityId);
    if (ownersError && (ownersError as { code?: string }).code !== "PGRST205") {
      return { ok: false, error: "ent_err_save_failed" }; // fail closed; PGRST205 = co-ownership not installed
    }
    if (((owners ?? []) as { profile_id: string | null }[]).some((o) => o.profile_id !== user.id)) {
      return { ok: false, error: "ent_err_co_owned" };
    }

    // What the caller can see: their own active assets + the active ones shared with them.
    const ASSET_COLUMNS = "id, asset_categories(name)";
    const { data: ownRows, error: ownError } = await db
      .from("assets")
      .select(ASSET_COLUMNS)
      .eq("profile_id", user.id)
      .eq("status", "active");
    if (ownError) return { ok: false, error: "ent_err_save_failed" };
    const own = toRefs(ownRows);
    const shared = toRefs(await loadCoOwnedAssets<{ id: string }>(db, user.id, ASSET_COLUMNS, new Set(own.map((a) => a.id))));
    const linkable = new Set(
      [...own, ...shared]
        .filter((a) => a.id !== entityId && a.asset_categories?.name !== COMPANIES_CATEGORY)
        .map((a) => a.id),
    );
    const heldAssetIds = requested.filter((id) => linkable.has(id));
    const skipped = requested.length - heldAssetIds.length;

    if (isDemoUser(user.id)) return { ok: true, heldAssetIds, skipped };

    const stored = entityRow.metadata;
    const base = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const metadata = { ...base, held_asset_ids: heldAssetIds };
    const { data: updated, error: updateError } = await db
      .from("assets")
      .update({ metadata: metadata as Json })
      .eq("id", entityId)
      .eq("profile_id", user.id)
      .select("id");
    if (updateError || !updated || (updated as unknown[]).length === 0) {
      return { ok: false, error: "ent_err_save_failed" };
    }

    // Only the Companies page reads these links (net worth and every other total are unchanged).
    revalidatePath("/dashboard/companies");
    return { ok: true, heldAssetIds, skipped };
  } catch {
    return { ok: false, error: "ent_err_save_failed" };
  }
}
