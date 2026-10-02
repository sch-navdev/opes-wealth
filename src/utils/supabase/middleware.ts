import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { readRequestGeo, sessionIdFromAccessToken } from "@/lib/session-location";

const LOCATION_COOKIE = "ow_loc";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getUser().
  // A simple mistake could make it very hard to debug issues with users
  // being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Security page: remember where this session really is (real IP, city, country from the
  // request). Once per session, gated by a cookie; it must never break or slow a request.
  if (user) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const sessionId = sessionIdFromAccessToken(session?.access_token);
      if (sessionId && request.cookies.get(LOCATION_COOKIE)?.value !== sessionId) {
        const geo = readRequestGeo(request.headers);
        await createServiceClient()
          .from("session_locations")
          .upsert({
            session_id: sessionId,
            user_id: user.id,
            ip: geo.ip,
            country: geo.country,
            city: geo.city,
            region: geo.region,
            user_agent: geo.userAgent,
            last_seen_at: new Date().toISOString(),
          });
        supabaseResponse.cookies.set(LOCATION_COOKIE, sessionId, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
        });
      }
    } catch {
      // Table missing (migration 0030 not applied) or a network hiccup: skip silently.
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make
  // sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
