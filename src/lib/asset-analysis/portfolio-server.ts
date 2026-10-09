import type { SupabaseClient } from "@supabase/supabase-js";
import { convertAmount } from "@/lib/fx";
import { loadCoOwnedAssets, loadOwnershipFactors } from "@/lib/shared-assets/load";
import type { AnalysisPortfolio } from "./common";

type Row = {
  id: string;
  profile_id: string;
  name: string;
  current_value: number | string;
  currency: string;
  is_liability: boolean;
  /** `metadata->>company_id` (set on bank accounts linked to a company). */
  company_id: string | null;
  asset_categories: { name: string } | null;
};

const COLUMNS = "id, profile_id, name, current_value, currency, is_liability, company_id:metadata->>company_id, asset_categories(name)";

/**
 * Light portfolio figures for the Analysis tab (server only): the viewer's total assets and their total in the
 * asset's class (share of portfolio), plus the accounts linked to a company. Same population as the dashboard
 * (own active assets plus co-owned ones, reduced to the viewer's share by `current_value x factor`), converted to
 * `base`. Real Estate counts at its stored value (equity). Never throws: any failure means "not available".
 */
export async function loadAnalysisPortfolio(
  supabase: SupabaseClient,
  userId: string,
  opts: { assetId: string; categoryName: string; base: string; ratesFromUsd: Record<string, number> },
): Promise<AnalysisPortfolio | null> {
  try {
    const { data: own } = await supabase.from("assets").select(COLUMNS).eq("profile_id", userId).eq("status", "active").returns<Row[]>();
    const ownRows = own ?? [];
    const shared = await loadCoOwnedAssets<Row>(supabase, userId, COLUMNS, new Set(ownRows.map((a) => a.id)));
    const rows = [...ownRows, ...shared];
    const factors = await loadOwnershipFactors(supabase, userId, rows);

    let totalAssets = 0;
    let categoryTotal = 0;
    const linkedAccounts: AnalysisPortfolio["linkedAccounts"] = [];
    for (const a of rows) {
      const f = factors.get(a.id) ?? 1;
      if (f <= 0) continue;
      const value = convertAmount(Number(a.current_value) * f, a.currency, opts.base, opts.ratesFromUsd);
      if (!Number.isFinite(value)) continue;
      if (a.company_id && a.company_id === opts.assetId && !a.is_liability) linkedAccounts.push({ id: a.id, name: a.name, value });
      if (a.is_liability) continue;
      totalAssets += value;
      if ((a.asset_categories?.name ?? "") === opts.categoryName) categoryTotal += value;
    }
    return { totalAssets, categoryTotal, currency: opts.base, linkedAccounts };
  } catch {
    return null;
  }
}
