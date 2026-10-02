import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { isDemoUser, userIdFromAccessToken } from "@/lib/demo-mode";
import { withDemoReadOnly } from "@/utils/supabase/demo-shim";

export async function createClient(options?: { rememberMe?: boolean }) {
  const rememberMe = options?.rememberMe ?? true;
  const cookieStore = await cookies();

  const client = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // `@supabase/ssr` sets a persistent `maxAge`/`expires` by
              // default. When "Remember me" is off, drop those so the
              // cookie becomes a session cookie the browser clears on close.
              const cookieOptions = rememberMe
                ? options
                : { ...options, maxAge: undefined, expires: undefined };

              cookieStore.set(name, value, cookieOptions);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );

  // The public demo login is read-only: its writes are swallowed and reported as saved
  // (see lib/demo-mode.ts). The identity comes from the session cookie and can only ever
  // make a session MORE restricted.
  const {
    data: { session },
  } = await client.auth.getSession();
  return isDemoUser(userIdFromAccessToken(session?.access_token)) ? withDemoReadOnly(client) : client;
}
