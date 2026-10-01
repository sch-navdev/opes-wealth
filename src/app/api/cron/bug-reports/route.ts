import { NextResponse } from "next/server";
import { flushBugReports } from "@/lib/assistant/bug-queue";

export const dynamic = "force-dynamic";

/**
 * Daily flush of the AI-reported bug queue (scheduled in `vercel.json`).
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`; without a
 * matching secret (or with none configured) it refuses, so it can't be
 * triggered by anyone else. Can also be run by hand with the same header.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await flushBugReports();
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "not_configured" ? 503 : 502 });
}
