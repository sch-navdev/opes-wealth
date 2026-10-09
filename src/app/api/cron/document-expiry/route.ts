import { NextResponse } from "next/server";
import { runDocumentExpiry } from "@/lib/vault-expiry-server";

export const dynamic = "force-dynamic";

/**
 * Daily job (scheduled in `vercel.json`): inserts one bell notification per Governance Vault document
 * per reminder band (60 / 30 / 7 days before expiry, and expired). Same protection as the other cron
 * routes: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; without a matching secret it refuses.
 * The response and the log carry COUNTS only (no titles, no user ids).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDocumentExpiry();
    console.log(
      `[cron:document-expiry] scanned=${result.scanned} due=${result.due} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
    return NextResponse.json(result, { status: result.failed > 0 ? 207 : 200 });
  } catch {
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
