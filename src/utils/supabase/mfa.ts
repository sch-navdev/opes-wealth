import type { createClient } from "./server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Whether the current session still needs to complete an MFA step-up
 * before it satisfies aal2.
 *
 * A session authenticated via Passkey (`amr` method `webauthn`) is treated
 * as strong authentication on its own — Supabase's own AAL calculation only
 * credits `mfa/*`-namespaced methods, so without this check a Passkey login
 * would still get redirected to `/login/mfa` even though the passkey itself
 * already proves possession + biometric/PIN verification.
 */
export async function needsMfaStepUp(
  supabase: ServerSupabaseClient,
): Promise<boolean> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === aal.nextLevel) {
    return false;
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const amr = claimsData?.claims.amr ?? [];

  const usedPasskey = amr.some((entry) =>
    typeof entry === "string" ? entry === "webauthn" : entry.method === "webauthn",
  );

  return !usedPasskey;
}
