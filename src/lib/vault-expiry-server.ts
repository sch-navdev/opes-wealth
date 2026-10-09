/**
 * Server side of the daily document-expiry job (service role). Counts only in the result and in logs:
 * no titles, no user ids. Idempotent: a reminder already stored for the same (document, threshold,
 * expiry date) is skipped, and a unique index (migration 0038) backs that up against a concurrent run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";
import { createNotification } from "@/lib/shared-assets/notifications-server";
import { isMissingVaultTable, todayUtc } from "@/lib/vault";
import { planReminders, reminderKey, type ExpiryDoc } from "@/lib/vault-expiry";

export type ExpiryRunResult = { available: boolean; scanned: number; due: number; sent: number; skipped: number; failed: number };

const SCAN_LIMIT = 2000;
const WINDOW_DAYS = 60;

/** Splits into groups small enough for a PostgREST `in.(…)` URL. */
const CHUNK = 100;
function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export async function runDocumentExpiry(now: Date = new Date(), service = createServiceClient()): Promise<ExpiryRunResult> {
  const db = service as unknown as SupabaseClient;
  const today = todayUtc(now);
  const empty: ExpiryRunResult = { available: true, scanned: 0, due: 0, sent: 0, skipped: 0, failed: 0 };

  const { data, error } = await db
    .from("asset_documents")
    .select("id, profile_id, asset_id, title, expires_on")
    .not("expires_on", "is", null)
    .lte("expires_on", addDays(today, WINDOW_DAYS))
    .order("expires_on", { ascending: true })
    .limit(SCAN_LIMIT);
  if (error) return { ...empty, available: !isMissingVaultTable(error), failed: isMissingVaultTable(error) ? 0 : 1 };
  const docs = ((data ?? []) as ExpiryDoc[]).filter((d) => typeof d.expires_on === "string");
  if (docs.length === 0) return empty;

  // Reminders already stored for these documents.
  const sent = new Set<string>();
  for (const group of chunks(docs.map((d) => d.id))) {
    const existing = await db.from("notifications").select("data").eq("kind", "document_expiry").in("data->>document_id", group);
    if (existing.error) {
      // Without the dedupe read we must not send (the unique index would only catch it after the fact).
      return { ...empty, scanned: docs.length, failed: 1 };
    }
    for (const row of (existing.data ?? []) as { data: Record<string, unknown> | null }[]) {
      const d = row.data ?? {};
      if (typeof d.document_id === "string" && typeof d.threshold === "string" && typeof d.expires_on === "string") {
        sent.add(reminderKey(d.document_id, d.threshold, d.expires_on));
      }
    }
  }

  const planned = planReminders(docs, sent, today);

  // Asset names for the message (one query).
  const assetIds = [...new Set(planned.map((p) => p.doc.asset_id))];
  const names = new Map<string, string>();
  for (const group of chunks(assetIds)) {
    const { data: assets } = await db.from("assets").select("id, name").in("id", group);
    for (const a of (assets ?? []) as { id: string; name: string }[]) names.set(a.id, a.name);
  }

  let ok = 0;
  let failed = 0;
  for (const p of planned) {
    const written = await createNotification(service, {
      profileId: p.doc.profile_id,
      kind: "document_expiry",
      assetId: p.doc.asset_id,
      data: {
        assetName: names.get(p.doc.asset_id),
        documentTitle: p.doc.title,
        threshold: p.threshold,
        // Dedupe keys (read back above and indexed by migration 0038).
        ...({ document_id: p.doc.id, expires_on: p.doc.expires_on } as Record<string, string>),
      },
    });
    if (written) ok += 1;
    else failed += 1;
  }
  return { available: true, scanned: docs.length, due: planned.length, sent: ok, skipped: docs.length - planned.length, failed };
}
