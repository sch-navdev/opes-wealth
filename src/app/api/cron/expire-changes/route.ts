import { NextResponse } from "next/server";
import { expirePendingRequests } from "@/lib/shared-assets/server";

export const dynamic = "force-dynamic";

/**
 * Daily job (scheduled in `vercel.json`): applies every pending asset change
 * request whose 7-day `expires_at` has passed and flags it auto-approved, so a
 * co-owner who never answers can't block an edit forever. Same protection as
 * the other cron route: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`,
 * and without a matching secret it refuses.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await expirePendingRequests();
  return NextResponse.json(result, { status: result.failed.length > 0 ? 207 : 200 });
}
