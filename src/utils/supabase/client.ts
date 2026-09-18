import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Enables `signInWithPasskey()` / `registerPasskey()` for
        // passwordless sign-in with a device passkey.
        experimental: { passkey: true },
      },
    },
  );
}
