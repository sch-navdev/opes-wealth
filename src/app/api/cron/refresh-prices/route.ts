import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import {
  buildSupabaseDeps,
  runPriceRefresh,
  toCronAsset,
  type CronAsset,
} from "@/lib/market-data/cron-refresh";
import type { Json } from "@/types/supabase";

export const dynamic = "force-dynamic";
/** Seconds. The run budget below stops cleanly well before this. */
export const maxDuration = 300;

const BUDGET_MS = 240_000;
const PAGE = 1000;

/**
 * Daily live-price refresh (scheduled in `vercel.json`) for every non-demo
 * user's active Equities and Crypto holdings, so history keeps accruing even
 * when nobody presses a refresh button. Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; same guard as the other cron routes.
 * Uses the service-role client (no user session), so nothing here is scoped by
 * RLS: demo users are excluded in code and each write is scoped to the asset's
 * owner. Returns counts only — no tickers, user ids or amounts.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { data: categories, error: catError } = await supabase
    .from("asset_categories")
    .select("id, name")
    .in("name", ["Equities", "Crypto"]);
  if (catError || !categories?.length) {
    return NextResponse.json({ error: "categories_unavailable" }, { status: 500 });
  }
  const kindById = new Map(
    categories.map((c) => [c.id, c.name === "Crypto" ? ("crypto" as const) : ("equity" as const)]),
  );

  const assets: CronAsset[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("assets")
      .select("id, profile_id, category_id, quantity, currency, ticker_symbol, metadata")
      .eq("status", "active")
      .in("category_id", [...kindById.keys()])
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: "assets_unavailable" }, { status: 500 });
    for (const row of data ?? []) {
      const kind = kindById.get(row.category_id);
      if (!kind) continue;
      assets.push(
        toCronAsset(
          {
            id: row.id,
            profile_id: row.profile_id,
            quantity: row.quantity,
            currency: row.currency,
            ticker_symbol: row.ticker_symbol,
            metadata: row.metadata as Json | null,
          },
          kind,
        ),
      );
    }
    if (!data || data.length < PAGE) break;
  }

  const summary = await runPriceRefresh(
    assets,
    { today: new Date().toISOString().slice(0, 10), budgetMs: BUDGET_MS },
    buildSupabaseDeps(supabase),
  );

  console.log(
    `[cron/refresh-prices] refreshed=${summary.refreshed} skipped=${summary.skipped} failed=${summary.failed} stopped_early=${summary.stopped_early}`,
  );
  return NextResponse.json(summary);
}
