/**
 * Loading side of co-ownership, shared by every page that totals the user's
 * assets (dashboard, Excel export, Companies): fetch the assets SHARED WITH the
 * user, compute the user's ownership factor per asset and reduce each asset to
 * the user's share (`ownership.ts#scaleAssetForOwner`).
 *
 * Works with both the cookie client (RLS lets co-owners read) and the dev-only
 * mock admin client (no RLS), because it always starts from the user's own
 * `asset_owners` rows rather than from "everything visible". If migration 0025
 * is not applied the owner queries return nothing and every factor is 1.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ownershipFactor,
  scaleAssetForOwner,
  scaleHistoryValue,
} from "@/lib/ownership";

type Row = {
  id: string;
  profile_id: string;
  quantity: number;
  current_value: number;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

/** Assets other people created that the user co-owns (not already in `ownIds`). */
export async function loadCoOwnedAssets<T extends { id: string }>(
  supabase: SupabaseClient,
  userId: string,
  columns: string,
  ownIds: Set<string>,
  opts: { categoryId?: string } = {},
): Promise<T[]> {
  const { data: mine } = await supabase.from("asset_owners").select("asset_id").eq("profile_id", userId);
  const ids = (mine ?? []).map((r: { asset_id: string }) => r.asset_id).filter((id: string) => !ownIds.has(id));
  if (ids.length === 0) return [];
  let query = supabase.from("assets").select(columns).in("id", ids);
  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  const { data } = await query;
  return (data ?? []) as unknown as T[];
}

/** The user's share (0–1) of each asset. */
export async function loadOwnershipFactors(
  supabase: SupabaseClient,
  userId: string,
  assets: { id: string; profile_id: string }[],
): Promise<Map<string, number>> {
  const factors = new Map<string, number>();
  if (assets.length === 0) return factors;
  const { data } = await supabase
    .from("asset_owners")
    .select("asset_id, profile_id, ownership_percentage")
    .in("asset_id", assets.map((a) => a.id));
  const rows = (data ?? []) as { asset_id: string; profile_id: string | null; ownership_percentage: number }[];
  for (const a of assets) {
    const mine = rows
      .filter((r) => r.asset_id === a.id)
      .map((r) => ({ profile_id: r.profile_id, ownership_percentage: Number(r.ownership_percentage) }));
    factors.set(a.id, ownershipFactor(a.profile_id, mine, userId));
  }
  return factors;
}

/** Reduces each asset to the user's share; drops assets the user owns none of. */
export function applyOwnershipFactors<T extends Row>(assets: T[], factors: Map<string, number>): T[] {
  const out: T[] = [];
  for (const a of assets) {
    const f = factors.get(a.id) ?? 1;
    if (f <= 0) continue;
    if (f === 1) {
      out.push(a);
      continue;
    }
    const scaled = scaleAssetForOwner(
      { category: a.asset_categories?.name ?? "", quantity: a.quantity, current_value: a.current_value, metadata: a.metadata },
      f,
    );
    out.push({ ...a, current_value: scaled.current_value, quantity: scaled.quantity, metadata: scaled.metadata });
  }
  return out;
}

/** Reduces stored history rows (whole-asset values) to the user's share. */
export function scaleHistoryRows<H extends { asset_id: string; value: number; net_equity: number | null }>(
  rows: H[],
  factors: Map<string, number>,
): H[] {
  return rows.map((h) => {
    const f = factors.get(h.asset_id) ?? 1;
    return f === 1
      ? h
      : {
          ...h,
          value: scaleHistoryValue(h.value, f),
          net_equity: h.net_equity == null ? h.net_equity : scaleHistoryValue(h.net_equity, f),
        };
  });
}
