import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";
import { runFxRefresh } from "@/lib/fx-rates-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily exchange-rate fixing (scheduled in `vercel.json` at 0 20 * * * UTC = midnight GST): stores the
 * rate of every currency the app handles for the GST day, so past values can be converted at the rate
 * of THEIR day (table `fx_rates_daily`, migration 0039). Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`; same guard as the other cron routes. Uses the service-role
 * client (the table is writable by the service role only). Returns counts only.
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

  const result = await runFxRefresh(supabase as unknown as SupabaseClient, "cron");
  if (!result.ok) {
    console.log(`[cron/fx-rates] failed code=${result.errorCode} date=${result.date}`);
    return NextResponse.json({ error: result.errorCode }, { status: result.errorCode === "table_missing" ? 503 : 500 });
  }
  console.log(
    `[cron/fx-rates] date=${result.date} currencies=${result.currencies} source=${result.source} carried=${result.carried} missing=${result.missing}`,
  );
  return NextResponse.json(result);
}
