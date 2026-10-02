"use server";

import { revalidatePath } from "next/cache";
import { isDemoUser } from "@/lib/demo-mode";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Both revoke actions end an authenticated session, so — like the MFA page —
 * they refuse to run on a session that still owes an MFA step-up: otherwise
 * an aal1 session could lock the real owner out of their other devices.
 */
async function requireStrongSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." } as const;
  if (await needsMfaStepUp(supabase)) {
    return { ok: false, error: "Complete two-factor verification first." } as const;
  }
  return { ok: true, supabase } as const;
}

/**
 * Revokes ONE other device's session via `public.revoke_my_session`
 * (migration 0016 — it only deletes rows whose `user_id = auth.uid()`). The
 * current session is deliberately rejected here; signing out of this device
 * goes through `supabase.auth.signOut()` (the Sign Out button) instead.
 */
export async function revokeSession(sessionId: string): Promise<ActionResult> {
  const guard = await requireStrongSession();
  if (!guard.ok) return { ok: false, error: guard.error };
  const { supabase } = guard;

  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims.session_id === sessionId) {
    return { ok: false, error: "This is the device you're using now — use Sign Out instead." };
  }

  const { data, error } = await supabase.rpc("revoke_my_session", {
    p_session_id: sessionId,
  });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "That session no longer exists." };

  revalidatePath("/dashboard/security");
  return { ok: true };
}

/** Revokes every session except the current one (Supabase's `scope: 'others'`). */
export async function revokeOtherSessions(): Promise<ActionResult> {
  const guard = await requireStrongSession();
  if (!guard.ok) return { ok: false, error: guard.error };

  // Signing others out would also end other visitors' demo sessions.
  const { data: claims } = await guard.supabase.auth.getClaims();
  if (isDemoUser(claims?.claims.sub)) return { ok: true };

  const { error } = await guard.supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/security");
  return { ok: true };
}
