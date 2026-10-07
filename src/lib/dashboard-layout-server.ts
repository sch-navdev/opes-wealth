/**
 * Server-side persistence of the customisable dashboard layout (`profiles.dashboard_layout`,
 * migration 0035). Takes the Supabase client as a parameter so the dashboard page can use the
 * same client it already built (mock-auth in dev included). Never throws: while the migration
 * is not applied (Postgres 42703 / PostgREST PGRST204, "column ... does not exist") loading
 * returns `null` and saving reports `unavailable`, so the UI falls back to localStorage.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  layoutsFitLimit,
  normalizeLayouts,
  type DashboardLayouts,
} from "@/lib/dashboard-layout";

/** The generated DB types predate migration 0035, so the column is reached through the untyped client. */
const untyped = (client: unknown) => client as SupabaseClient;

/** True for "the dashboard_layout column is not there yet". */
export function isMissingLayoutColumn(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42703" ||
    e.code === "PGRST204" ||
    (/dashboard_layout/i.test(e.message ?? "") && /does not exist|schema cache|could not find/i.test(e.message ?? ""))
  );
}

/** The user's saved layouts (validated), or null when none is saved / the column is missing / anything fails. */
export async function loadDashboardLayouts(client: unknown, userId: string): Promise<DashboardLayouts | null> {
  try {
    const { data, error } = await untyped(client)
      .from("profiles")
      .select("dashboard_layout")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const raw = (data as { dashboard_layout?: unknown }).dashboard_layout;
    if (raw == null) return null;
    return normalizeLayouts(raw);
  } catch {
    return null;
  }
}

export type StoreLayoutResult = { ok: true } | { ok: false; error: string; unavailable?: boolean };

/** Writes the (already validated) layouts to the user's own profile row. */
export async function storeDashboardLayouts(
  client: unknown,
  userId: string,
  layouts: DashboardLayouts,
): Promise<StoreLayoutResult> {
  if (!layoutsFitLimit(layouts)) return { ok: false, error: "Layout is too large." };
  try {
    const { data, error } = await untyped(client)
      .from("profiles")
      .update({ dashboard_layout: layouts })
      .eq("id", userId)
      .select("id");
    if (error) {
      return { ok: false, error: error.message, unavailable: isMissingLayoutColumn(error) };
    }
    if (!data || data.length === 0) return { ok: false, error: "Profile not found." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the layout." };
  }
}
