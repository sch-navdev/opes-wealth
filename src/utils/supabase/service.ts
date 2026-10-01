import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Service-role Supabase client for the few server paths that must touch data
 * the browser role may never read — currently the encrypted bank-connection
 * tokens (`bank_connections`, see migration 0020, where those columns are
 * not selectable by `authenticated`).
 *
 * It bypasses Row Level Security, so every caller MUST first authenticate the
 * user through the normal cookie-bound client and then scope each query to
 * that user's id explicitly. Server-only: `SUPABASE_SERVICE_ROLE_KEY` is
 * never exposed to the client (no `NEXT_PUBLIC_` prefix).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY (or the Supabase URL) is not set on the server.");
  }
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
