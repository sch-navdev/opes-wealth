import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * Local-only auth bypass so a terminal agent (no browser, can't complete a
 * passkey ceremony) can load authenticated pages against real data.
 *
 * Gating is deliberately redundant: `NODE_ENV === "development"` is the
 * actual guard (Vercel/`next build` always set `NODE_ENV=production`, and
 * nothing here can override that), and `NEXT_PUBLIC_MOCK_AUTH` is a second,
 * explicit opt-in on top of it so a stray env var alone can never enable
 * this. Never set `NEXT_PUBLIC_MOCK_AUTH` outside a local `.env.local`.
 */
const MOCK_AUTH_ENABLED =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_MOCK_AUTH === "true";

export function isMockAuthEnabled(): boolean {
  return MOCK_AUTH_ENABLED;
}

export function getMockUserId(): string | null {
  if (!MOCK_AUTH_ENABLED) return null;
  return process.env.MOCK_AUTH_USER_ID || null;
}

/**
 * A Supabase client authenticated via the service role key, which bypasses
 * Row Level Security entirely. Only ever constructed when
 * `isMockAuthEnabled()` is true — there is no real session to attach a
 * mocked user id to, so this is the only way the mock session can read
 * rows that RLS would otherwise scope to a real `auth.uid()`.
 */
export function createMockAdminClient() {
  if (!MOCK_AUTH_ENABLED) {
    throw new Error("createMockAdminClient() called outside mock-auth mode");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_MOCK_AUTH=true but SUPABASE_SERVICE_ROLE_KEY is not set in .env.local " +
        "(Supabase Dashboard → Project Settings → API → service_role key).",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
