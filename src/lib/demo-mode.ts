/**
 * Demo account: read-only by design. The demo login (demo@opeswealth.com, password
 * published on the sign-in page) is public, so it must never be able to change data.
 *
 * Three layers, so no single mistake opens a hole:
 *   1. DATABASE (migration 0032): restrictive RLS policies deny INSERT/UPDATE/DELETE
 *      for this user id on every table, and on storage. The real guarantee.
 *   2. SERVER (utils/supabase/demo-shim.ts + guards on the few service-role paths):
 *      the demo user's writes become no-ops that report success, so the app never
 *      shows an RLS error.
 *   3. BROWSER (components/demo-mode-toast.tsx): a green "Saved (Demo Mode)" toast
 *      after each server action.
 *
 * The id is the demo user created by scripts/seed-demo.mts (re-running the seed
 * keeps it). Set DEMO_USER_ID to use a different demo user on another project.
 */
export const DEMO_USER_ID = process.env.DEMO_USER_ID ?? "ddf92bf5-5beb-45c1-bf92-d3b696806d13";

export function isDemoUser(userId: string | null | undefined): boolean {
  return !!userId && userId.toLowerCase() === DEMO_USER_ID.toLowerCase();
}

/** The `sub` claim of an access token (no signature check). Only ever used to make a session MORE restricted. */
export function userIdFromAccessToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Monthly income (in the demo's base currency) assumed on the Future Projects screens when the visitor has not typed one. */
export const DEMO_MONTHLY_INCOME = 60000;
