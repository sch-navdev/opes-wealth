"use server";

import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { createMockAdminClient, getMockUserId, isMockAuthEnabled } from "@/utils/supabase/mock-auth";
import { DEFAULT_BASE_CURRENCY, getExchangeRatesFromUsd } from "@/lib/fx";
import { buildComparableHoldings, collectHoldingFxRequests, type HoldingAssetInput } from "@/lib/irr-holdings";
import { fetchHoldingFx } from "@/lib/irr-holdings-fetch";
import type { ComparableHolding } from "@/lib/irr-compare-types";
import { applyOwnershipFactors, loadCoOwnedAssets, loadOwnershipFactors } from "@/lib/shared-assets/load";

export type ComparableHoldingsResult =
  | { ok: true; holdings: ComparableHolding[]; baseCurrency: string }
  | { ok: false; error: string };

type AssetRow = HoldingAssetInput & {
  profile_id: string;
  category_id: string;
  asset_categories: { name: string } | null;
};

const ASSET_COLUMNS =
  "id, profile_id, name, category_id, quantity, current_value, currency, is_liability, metadata, ticker_symbol, purchase_date, asset_categories(name)";

/**
 * The signed-in user's holdings as IRR cash-flow streams for the comparison picker, in the user's base
 * currency (`profiles.default_currency`, the dashboard's default). Same gates as the dashboard (session, MFA
 * step-up, dev-only mock auth), the same co-ownership reduction to the user's share, and the same FX approach
 * (today's table for the current value, historical rates for the dated flows, time-boxed). The user id always
 * comes from the session; nothing is taken from the caller. Output is plain JSON.
 */
export async function getComparableHoldings(): Promise<ComparableHoldingsResult> {
  try {
    // DEV-ONLY MOCK AUTH: same gate as the dashboard page (`isMockAuthEnabled` is hard-gated on NODE_ENV).
    const mockUserId = isMockAuthEnabled() ? getMockUserId() : null;
    const supabase = mockUserId ? createMockAdminClient() : await createClient();
    const user = mockUserId ? { id: mockUserId } : (await supabase.auth.getUser()).data.user;
    if (!user) return { ok: false, error: "You must be signed in." };
    if (!mockUserId && (await needsMfaStepUp(supabase))) {
      return { ok: false, error: "Two-factor verification required." };
    }

    const [{ data: ownRows, error: assetsError }, { data: profile }, rates] = await Promise.all([
      supabase
        .from("assets")
        .select(ASSET_COLUMNS)
        .eq("profile_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .returns<AssetRow[]>(),
      supabase.from("profiles").select("default_currency").eq("id", user.id).single(),
      getExchangeRatesFromUsd(),
    ]);
    if (assetsError) return { ok: false, error: "Could not load your assets." };

    const baseCurrency = profile?.default_currency || DEFAULT_BASE_CURRENCY;

    // Co-ownership: add the assets shared with the user and reduce every asset to the user's share.
    const own = ownRows ?? [];
    const ownIds = new Set(own.map((a) => a.id));
    const shared = await loadCoOwnedAssets<AssetRow>(supabase, user.id, ASSET_COLUMNS, ownIds);
    const unscaled = [...own, ...shared.filter((a) => !ownIds.has(a.id))];
    const factors = await loadOwnershipFactors(supabase, user.id, unscaled);
    const assets: HoldingAssetInput[] = applyOwnershipFactors(unscaled, factors).map((a) => ({
      id: a.id,
      name: a.name,
      quantity: a.quantity,
      current_value: a.current_value,
      currency: a.currency,
      is_liability: a.is_liability,
      metadata: a.metadata,
      purchase_date: a.purchase_date,
      ticker_symbol: a.ticker_symbol,
      asset_categories: a.asset_categories,
      ownershipShare: factors.get(a.id) ?? 1,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const requests = collectHoldingFxRequests(assets, baseCurrency, today);
    // Time-boxed; a provider failure only turns the affected holdings into `missing_fx`.
    const fxHistory = Object.keys(requests).length > 0 ? await fetchHoldingFx(requests, baseCurrency) : {};

    const holdings = buildComparableHoldings({ assets, baseCurrency, rates, fxHistory, today });
    return { ok: true, holdings, baseCurrency };
  } catch {
    return { ok: false, error: "Could not load your holdings." };
  }
}
