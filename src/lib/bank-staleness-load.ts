/**
 * Server-side loader for the Banking tab's "balance as of" dates: per Cash asset the newest
 * `asset_history.recorded_date` and the newest `transactions.booked_date` (one small `limit 1` query
 * each, in parallel; a Cash portfolio has a handful of accounts). Read-only. A failing query (for
 * example `transactions` before migration 0022) simply yields no date for that source.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BalanceDateSources } from "@/lib/bank-staleness";

export async function loadBalanceDateSources(
  supabase: SupabaseClient,
  assetIds: readonly string[],
): Promise<Map<string, BalanceDateSources>> {
  const entries = await Promise.all(
    assetIds.map(async (id): Promise<[string, BalanceDateSources]> => {
      const [history, transaction] = await Promise.all([
        supabase
          .from("asset_history")
          .select("recorded_date")
          .eq("asset_id", id)
          .order("recorded_date", { ascending: false })
          .limit(1)
          .returns<{ recorded_date: string }[]>(),
        supabase
          .from("transactions")
          .select("booked_date")
          .eq("asset_id", id)
          .order("booked_date", { ascending: false })
          .limit(1)
          .returns<{ booked_date: string }[]>(),
      ]);
      return [
        id,
        {
          historyDate: history.data?.[0]?.recorded_date ?? null,
          transactionDate: transaction.data?.[0]?.booked_date ?? null,
        },
      ];
    }),
  );
  return new Map(entries);
}
