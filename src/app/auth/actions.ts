"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { passwordSchema } from "@/lib/auth-validation";

/**
 * The app's real, custom production domain. Every auth email link
 * (`emailRedirectTo`) must resolve here — never to a raw Vercel deployment
 * URL, which this project's SSO Protection would show an auth wall on
 * instead of the app, breaking the link for the person clicking it.
 */
const PRODUCTION_SITE_URL = "https://www.opeswealth.app";

/**
 * The app's own canonical URL, used for every auth email redirect link.
 * Strictly `NEXT_PUBLIC_SITE_URL` — deliberately does NOT fall back to
 * Vercel's per-deployment `VERCEL_URL`. If that env var is ever unset while
 * actually running on Vercel (any environment), pin to the real production
 * domain rather than construct one from the deployment URL; only fall back
 * to localhost when there's no `VERCEL_URL` at all, i.e. local dev.
 */
function getSiteURL(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    return configured.endsWith("/") ? configured.slice(0, -1) : configured;
  }
  return process.env.VERCEL_URL ? PRODUCTION_SITE_URL : "http://localhost:3000";
}

export async function login(formData: FormData): Promise<{ error: string }> {
  const rememberMe = formData.get("rememberMe") === "on";
  const supabase = await createClient({ rememberMe });

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  let signInError: string | null = null;
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    signInError = error?.message ?? null;
  } catch (err) {
    console.error("login: unexpected error calling signInWithPassword", err);
    return { error: "Something went wrong signing you in. Please try again." };
  }

  if (signInError) {
    // Supabase returns the same generic "Invalid login credentials" for a
    // wrong password AND for a correct-but-unverified account — the second
    // case reads as "I typed it wrong" when the real issue is an unread
    // confirmation email, so clarify it rather than passing the raw message
    // straight through.
    const message =
      signInError === "Invalid login credentials"
        ? "Invalid login credentials. If you just created an account, please check your email to verify it."
        : signInError;
    return { error: message };
  }

  revalidatePath("/", "layout");

  if (await needsMfaStepUp(supabase)) {
    redirect("/login/mfa");
  }

  redirect("/dashboard");
}

export async function signup(
  formData: FormData,
): Promise<{ error: string } | { needsEmailVerification: true }> {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = (formData.get("firstName") as string) || undefined;
  const lastName = (formData.get("lastName") as string) || undefined;

  // Defense in depth: the form already blocks submission on a weak
  // password client-side, but a request can always bypass the client.
  const passwordCheck = passwordSchema.safeParse(password);
  if (!passwordCheck.success) {
    return { error: passwordCheck.error.issues[0].message };
  }

  let signUpResult: { user: unknown; session: unknown } | null = null;
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName },
        emailRedirectTo: `${getSiteURL()}/auth/callback`,
      },
    });

    if (error) {
      return { error: error.message };
    }

    signUpResult = data;
  } catch (err) {
    console.error("signup: unexpected error calling signUp", err);
    return {
      error: "Something went wrong creating your account. Please try again.",
    };
  }

  // Supabase returns a user but no session when email confirmation is
  // required (project setting) — in that case there's no session to log
  // the person into yet, so send the UI to a "check your email" state
  // instead of redirecting to /dashboard.
  if (signUpResult.user && !signUpResult.session) {
    return { needsEmailVerification: true as const };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Sends a Supabase password-recovery email. Always reports success (even if
 * the address doesn't have an account) so this can't be used to enumerate
 * registered emails — Supabase itself doesn't error on an unknown address
 * here, it just silently doesn't send.
 */
export async function requestPasswordReset(
  formData: FormData,
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient();
  const email = formData.get("email") as string;

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteURL()}/auth/callback?next=/reset-password`,
    });

    // A rate-limit or malformed-input error is worth surfacing; anything
    // else (e.g. address not found) still reports success, deliberately.
    if (error && error.status !== 400 && error.code !== "user_not_found") {
      return { error: error.message };
    }
  } catch (err) {
    console.error(
      "requestPasswordReset: unexpected error calling resetPasswordForEmail",
      err,
    );
    return {
      error: "Something went wrong sending the reset email. Please try again.",
    };
  }

  return { success: true as const };
}

/**
 * Verifies the TOTP step-up code on `/login/mfa`.
 *
 * Intentionally TOTP-only: Passkeys are a standalone passwordless sign-in
 * method, not an MFA factor, and a Passkey login already satisfies strong
 * authentication on its own — `needsMfaStepUp` (see `utils/supabase/mfa.ts`)
 * bypasses `/login/mfa` entirely for those sessions, so this action never
 * needs to handle a passkey-based step-up.
 */
export async function verifyMfaLogin(code: string) {
  const supabase = await createClient();

  const { data: factorsData, error: factorsError } =
    await supabase.auth.mfa.listFactors();

  if (factorsError) {
    return { error: factorsError.message };
  }

  const totpFactor = factorsData.totp[0];

  if (!totpFactor) {
    return { error: "No TOTP factor found for this account." };
  }

  const factorId = totpFactor.id;

  const { data: challengeData, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId });

  if (challengeError) {
    return { error: challengeError.message };
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  });

  if (verifyError) {
    return { error: verifyError.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login");
}
