/**
 * Server side of the in-app notifications (table from migration 0034). Uses the service
 * role, so callers authorise the user first. EVERYTHING here is best-effort: a missing
 * table (migration not applied yet: Postgres 42P01 / PostgREST PGRST205) or any other
 * error is swallowed so approvals never fail because of a notification.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";
import { toNotificationItem, type NotificationData, type NotificationItem, type NotificationKind } from "@/lib/notifications";

type Service = ReturnType<typeof createServiceClient>;

/** The generated DB types predate migration 0034, so the table is reached through the untyped client. */
const untyped = (service: Service) => service as unknown as SupabaseClient;

export const NOTIFICATION_LIST_LIMIT = 10;

let warned = false;
function warnOnce(where: string, err: unknown) {
  if (warned) return;
  warned = true;
  const e = err as { code?: string; message?: string } | null;
  const missing = isMissingTable(err);
  console.warn(
    `[notifications] ${where} skipped${missing ? " (table missing: apply migration 0034)" : ""}: ${e?.message ?? String(err)}`,
  );
}

/** True for "the notifications table is not there yet". */
export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? "");
}

/**
 * Records a notification for `profileId`. Never throws; returns whether a row was written.
 * Skips when the recipient is the actor (nobody is notified about their own action).
 */
export async function createNotification(
  service: Service,
  opts: {
    profileId: string;
    kind: NotificationKind;
    assetId?: string | null;
    requestId?: string | null;
    data?: NotificationData;
    actorId?: string | null;
  },
): Promise<boolean> {
  try {
    if (opts.actorId && opts.actorId === opts.profileId) return false;
    const { error } = await untyped(service).from("notifications").insert({
      profile_id: opts.profileId,
      kind: opts.kind,
      asset_id: opts.assetId ?? null,
      request_id: opts.requestId ?? null,
      data: opts.data ?? {},
    });
    if (error) {
      warnOnce("insert", error);
      return false;
    }
    return true;
  } catch (e) {
    warnOnce("insert", e);
    return false;
  }
}

/** The latest notifications for a user (newest first). [] when there are none or the table is missing. */
export async function loadNotifications(userId: string, service?: Service): Promise<NotificationItem[]> {
  try {
    const client = service ?? createServiceClient();
    const { data, error } = await untyped(client)
      .from("notifications")
      .select("id, kind, asset_id, request_id, data, read_at, created_at")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_LIST_LIMIT);
    if (error) {
      warnOnce("load", error);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map(toNotificationItem).filter((n): n is NotificationItem => n !== null);
  } catch (e) {
    warnOnce("load", e);
    return [];
  }
}

/** Marks one of `userId`'s own notifications as read (another user's id matches nothing). */
export async function markRead(service: Service, userId: string, id: string): Promise<boolean> {
  try {
    const { error } = await untyped(service)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("profile_id", userId)
      .is("read_at", null);
    if (error) {
      warnOnce("mark read", error);
      return false;
    }
    return true;
  } catch (e) {
    warnOnce("mark read", e);
    return false;
  }
}

/** Marks every unread notification of `userId` as read. */
export async function markAllRead(service: Service, userId: string): Promise<boolean> {
  try {
    const { error } = await untyped(service)
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("profile_id", userId)
      .is("read_at", null);
    if (error) {
      warnOnce("mark all read", error);
      return false;
    }
    return true;
  } catch (e) {
    warnOnce("mark all read", e);
    return false;
  }
}

/** Test hook: lets the once-only warning fire again. */
export function resetNotificationWarning() {
  warned = false;
}
