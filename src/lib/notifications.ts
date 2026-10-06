/**
 * In-app notifications: shared types and PURE helpers (no server imports, safe in client
 * components). The table is created by migration 0034 (see tracker/Co-Ownership.md); rows
 * hold structured `data`, and the sentence is built here, in the viewer's language.
 */
import type { TranslationKey } from "@/lib/i18n";

export const NOTIFICATION_KINDS = ["change_approved", "change_rejected", "change_auto_applied"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationData = {
  assetName?: string;
  /** Display name of the co-owner who decided (absent for an automatic application). */
  responderName?: string;
  responderId?: string;
};

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  assetId: string | null;
  requestId: string | null;
  data: NotificationData;
  readAt: string | null;
  createdAt: string;
};

const KIND_KEYS: Record<NotificationKind, TranslationKey> = {
  change_approved: "notif_change_approved",
  change_rejected: "notif_change_rejected",
  change_auto_applied: "notif_change_auto_applied",
};

export function isNotificationKind(v: unknown): v is NotificationKind {
  return typeof v === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(v);
}

/** Which dictionary key renders a notification of this kind. */
export function notificationMessageKey(kind: NotificationKind): TranslationKey {
  return KIND_KEYS[kind];
}

/** Placeholder values for the message; `fallbackName` / `fallbackAsset` are already-translated defaults. */
export function notificationParams(
  data: NotificationData,
  fallbackName: string,
  fallbackAsset: string,
): { name: string; asset: string } {
  return {
    name: data.responderName?.trim() || fallbackName,
    asset: data.assetName?.trim() || fallbackAsset,
  };
}

/** Normalises a raw table row (or anything) to a NotificationItem, or null if it is unusable. */
export function toNotificationItem(row: Record<string, unknown>): NotificationItem | null {
  if (typeof row.id !== "string" || !isNotificationKind(row.kind) || typeof row.created_at !== "string") return null;
  const raw = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    id: row.id,
    kind: row.kind,
    assetId: typeof row.asset_id === "string" ? row.asset_id : null,
    requestId: typeof row.request_id === "string" ? row.request_id : null,
    data: { assetName: str(raw.assetName), responderName: str(raw.responderName), responderId: str(raw.responderId) },
    readAt: typeof row.read_at === "string" ? row.read_at : null,
    createdAt: row.created_at,
  };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "5 minutes ago" / "yesterday" in `locale`; anything under a minute is "now". `now` is injectable for tests. */
export function relativeTime(iso: string, locale: string, now: number = Date.now()): string {
  const ts = Date.parse(iso);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Number.isNaN(ts)) return "";
  const diff = ts - now; // negative = past
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return rtf.format(Math.trunc(diff / ms), unit);
  }
  return rtf.format(0, "second");
}

export function unreadCount(items: { readAt: string | null }[]): number {
  return items.filter((i) => !i.readAt).length;
}
