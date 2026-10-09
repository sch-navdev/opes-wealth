/**
 * Expiry reminders for the Governance Vault: PURE planning logic used by the daily cron
 * (`/api/cron/document-expiry`). A document gets at most one reminder per threshold (60, 30, 7 days
 * before, and "expired") per expiry date; only the band the document is currently in is sent, so a
 * missed run never produces a burst of stale reminders.
 */
import { daysUntil } from "@/lib/vault";

export const EXPIRY_THRESHOLDS = [60, 30, 7] as const;
export type ExpiryThreshold = "60" | "30" | "7" | "expired";

/** The band a document is in today, or null when it is further away than 60 days. */
export function dueThreshold(expiresOn: string, today: string): ExpiryThreshold | null {
  const days = daysUntil(expiresOn, today);
  if (days < 0) return "expired";
  if (days <= 7) return "7";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  return null;
}

export type ExpiryDoc = { id: string; profile_id: string; asset_id: string; title: string; expires_on: string };

export type PlannedReminder = { doc: ExpiryDoc; threshold: ExpiryThreshold; daysLeft: number };

export const reminderKey = (documentId: string, threshold: string, expiresOn: string) => `${documentId}|${threshold}|${expiresOn}`;

/** Which reminders to create now, skipping every (document, threshold, expiry date) already sent. */
export function planReminders(docs: ExpiryDoc[], alreadySent: ReadonlySet<string>, today: string): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const doc of docs) {
    const threshold = dueThreshold(doc.expires_on, today);
    if (!threshold) continue;
    if (alreadySent.has(reminderKey(doc.id, threshold, doc.expires_on))) continue;
    out.push({ doc, threshold, daysLeft: daysUntil(doc.expires_on, today) });
  }
  return out;
}
