"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

/** The email-link types we send (see docs/emails). */
const OTP_TYPES = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/** Where a confirmed link may send the browser: never an arbitrary `next`. */
const ALLOWED_NEXT_PATHS = new Set(["/dashboard", "/reset-password", "/dashboard/settings"]);

/**
 * Completes an emailed link (sign-up confirmation, invitation, password reset, email
 * change) on OUR domain: exchanges the one-time `token_hash` for a session, then
 * redirects into the app. It runs from a button press on /auth/confirm, not from the
 * link itself, because mail providers' link scanners open links automatically and a
 * link that acted on a plain visit would be used up before the person clicked it.
 */
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const requestedNext = String(formData.get("next") ?? "");
  const next = ALLOWED_NEXT_PATHS.has(requestedNext) ? requestedNext : "/dashboard";

  if (tokenHash && OTP_TYPES.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  }

  redirect(`/login?error=${encodeURIComponent("Could not verify this link. It may have expired or already been used. Please request a new one.")}`);
}
