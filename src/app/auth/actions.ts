"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { passwordSchema } from "@/lib/auth-validation";

/**
 * The app's own canonical URL, used for auth email redirect links. Prefers
 * an explicit env var over Vercel's per-deployment `VERCEL_URL` — this
 * project has SSO Protection enabled on non-custom-domain deployment URLs,
 * so a raw `VERCEL_URL` redirect would land a verifying user on Vercel's
 * auth wall instead of the app.
 */
function getSiteURL(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export async function login(formData: FormData): Promise<{ error: string }> {
  const rememberMe = formData.get("rememberMe") === "on";
  const supabase = await createClient({ rememberMe });

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
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

  // Supabase returns a user but no session when email confirmation is
  // required (project setting) — in that case there's no session to log
  // the person into yet, so send the UI to a "check your email" state
  // instead of redirecting to /dashboard.
  if (data.user && !data.session) {
    return { needsEmailVerification: true as const };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
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
