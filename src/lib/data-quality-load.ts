/**
 * Server-side loader for the Data quality page: the same assets the dashboard totals (own plus
 * co-owned, reduced to the user's share), their raw history and the rate table, run through
 * `runDataQualityChecks`. Read-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllAssetHistory } from "@/lib/asset-history-fetch";
import { runDataQualityChecks, type DataQualityAsset, type DataQualityReport } from "@/lib/data-quality";
import { DEFAULT_BASE_CURRENCY, getExchangeRatesWithStatus } from "@/lib/fx";
import { applyOwnershipFactors, loadCoOwnedAssets, loadOwnershipFactors, scaleHistoryRows } from "@/lib/shared-assets/load";

type LoadedAsset = DataQualityAsset & { profile_id: string };

const COLUMNS =
  "id, profile_id, name, quantity, current_value, currency, is_liability, metadata, purchase_date, asset_categories(name)";

/** Groups history rows per asset id (insertion order kept). */
export function groupHistoryByAsset<H extends { asset_id: string }>(rows: readonly H[]): Map<string, H[]> {
  const map = new Map<string, H[]>();
  for (const row of rows) {
    const list = map.get(row.asset_id);
    if (list) list.push(row);
    else map.set(row.asset_id, [row]);
  }
  return map;
}

export async function loadDataQualityReport(
  supabase: SupabaseClient,
  userId: string,
  currencyParam?: string,
): Promise<{ report: DataQualityReport; baseCurrency: string }> {
  const [{ data: own }, { data: profile }, fx, shared] = await Promise.all([
    supabase
      .from("assets")
      .select(COLUMNS)
      .eq("profile_id", userId)
      .eq("status", "active")
      .returns<(LoadedAsset & { category_id?: string })[]>(),
    supabase.from("profiles").select("default_currency").eq("id", userId).single(),
    getExchangeRatesWithStatus(),
    loadCoOwnedAssets<LoadedAsset>(supabase, userId, COLUMNS, new Set()),
  ]);

  const ownIds = new Set((own ?? []).map((a) => a.id));
  const unscaled = [...(own ?? []), ...shared.filter((a) => !ownIds.has(a.id))];
  const factors = await loadOwnershipFactors(supabase, userId, unscaled);
  const assets = applyOwnershipFactors(unscaled, factors);

  const history = scaleHistoryRows(await fetchAllAssetHistory(supabase, assets.map((a) => a.id)), factors);
  const baseCurrency = currencyParam || profile?.default_currency || DEFAULT_BASE_CURRENCY;

  const report = runDataQualityChecks({
    assets,
    historyByAsset: groupHistoryByAsset(history),
    rates: fx.rates,
    fxSource: fx.source,
    baseCurrency,
    today: new Date().toISOString().slice(0, 10),
  });
  return { report, baseCurrency };
}
