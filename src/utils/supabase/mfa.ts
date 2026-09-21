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

  if (!aal) {
    return false;
  }

  // `currentAuthenticationMethods` reflects how this specific session was
  // established. If a passkey was used, that already satisfies strong
  // authentication on its own — bypass the step-up immediately. Entries can
  // be plain strings or `{ method, timestamp }` objects; "webauthn" is the
  // real AMR value Supabase uses for passkey sign-in (there is no separate
  // "passkey" value).
  const usedPasskeyMethod = aal.currentAuthenticationMethods?.some((entry) =>
    typeof entry === "string" ? entry === "webauthn" : entry.method === "webauthn",
  );

  if (usedPasskeyMethod) {
    return false;
  }

  if (aal.nextLevel !== "aal2" || aal.currentLevel === aal.nextLevel) {
    return false;
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const amr = claimsData?.claims.amr ?? [];

  const usedPasskeyAmr = amr.some((entry) =>
    typeof entry === "string" ? entry === "webauthn" : entry.method === "webauthn",
  );

  return !usedPasskeyAmr;
}
