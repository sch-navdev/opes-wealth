import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Where this route may send the browser after a successful code exchange.
 * `next` comes from the query string of a link we ourselves generated
 * (`emailRedirectTo`), but query strings are still attacker-influenceable in
 * general — never redirect to an arbitrary `next` value, only one from this
 * allow-list.
 */
const ALLOWED_NEXT_PATHS = new Set(["/dashboard", "/reset-password"]);

/**
 * Handles the link Supabase emails for signup confirmation and password
 * recovery (both are PKCE-flow email links): exchanges the `code` query
 * param for a real session, then redirects into the app — `/dashboard` by
 * default, or wherever `next` (allow-listed) says, e.g. `/reset-password`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const next = ALLOWED_NEXT_PATHS.has(requestedNext ?? "")
    ? requestedNext!
    : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "Could not verify this link. Please try signing in, or sign up again.",
    )}`,
  );
}
