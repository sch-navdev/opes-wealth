import type { SupabaseClient } from "@supabase/supabase-js";

export type AssetHistoryRow = {
  asset_id: string;
  recorded_date: string;
  value: number;
  net_equity: number | null;
};

const PAGE_SIZE = 1000;
const ID_CHUNK = 100;

/**
 * Every `asset_history` row for the given assets, oldest first, with no
 * window: the dashboard chart must start at the earliest recorded date.
 * PostgREST silently truncates a response at its max-rows setting (1000 by
 * default), and with an ascending sort that would cut off the NEWEST rows —
 * a portfolio with a few years of imported trade history can cross that — so
 * this pages through with `range()` (stable order: date, then id) and also
 * chunks the `in()` list so a large portfolio can't overflow the URL.
 */
export async function fetchAllAssetHistory(
  supabase: SupabaseClient,
  assetIds: string[],
): Promise<AssetHistoryRow[]> {
  const rows: AssetHistoryRow[] = [];

  for (let i = 0; i < assetIds.length; i += ID_CHUNK) {
    const ids = assetIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("asset_history")
        .select("asset_id, recorded_date, value, net_equity")
        .in("asset_id", ids)
        .order("recorded_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
        .returns<AssetHistoryRow[]>();
      if (error) {
        console.error("fetchAllAssetHistory:", error.message);
        break;
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }

  return rows;
}
