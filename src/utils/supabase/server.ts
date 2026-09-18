import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient(options?: { rememberMe?: boolean }) {
  const rememberMe = options?.rememberMe ?? true;
  const cookieStore = await cookies();

  return createServerClient(
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
}
