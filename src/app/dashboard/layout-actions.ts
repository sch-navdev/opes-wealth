"use server";

import { createClient } from "@/utils/supabase/server";
import { normalizeLayouts, type DashboardLayouts } from "@/lib/dashboard-layout";
import { loadDashboardLayouts, storeDashboardLayouts } from "@/lib/dashboard-layout-server";

export type GetLayoutResult =
  | { ok: true; layouts: DashboardLayouts | null }
  | { ok: false; error: string };

export type SaveLayoutResult =
  | { ok: true; layouts: DashboardLayouts }
  | { ok: false; error: string; unavailable?: boolean };

/** The signed-in user's saved dashboard layouts (null = none saved yet, or migration 0035 not applied). */
export async function getDashboardLayout(): Promise<GetLayoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  return { ok: true, layouts: await loadDashboardLayouts(supabase, user.id) };
}

/**
 * Saves the signed-in user's dashboard layouts to their own profile row. The input is never
 * trusted: it is rebuilt by the pure normaliser (unknown blocks dropped, sizes clamped), and the
 * normalised copy is what is stored and returned. `unavailable: true` means migration 0035 is not
 * applied yet; the caller then keeps the layout in localStorage.
 */
export async function saveDashboardLayout(layouts: unknown): Promise<SaveLayoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  if (typeof layouts !== "object" || layouts === null || Array.isArray(layouts)) {
    return { ok: false, error: "Invalid layout." };
  }
  const clean = normalizeLayouts(layouts);
  const stored = await storeDashboardLayouts(supabase, user.id, clean);
  return stored.ok ? { ok: true, layouts: clean } : stored;
}
