import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { exchangeAuthorizationCode } from "@/lib/banking/altareq";
import { decryptSecret, encryptSecret } from "@/lib/banking/token-crypto";

export const dynamic = "force-dynamic";

const FLOW_TTL_MS = 10 * 60 * 1000;

/**
 * OAuth redirect target for the live Open Finance flow
 * (`ALTAREQ_REDIRECT_URI` must point here). Validates the one-time `state`
 * against the pending connection of THIS signed-in user (CSRF / session-
 * fixation protection, 10-minute window), exchanges the code with the stored
 * PKCE verifier, then stores the tokens ENCRYPTED and clears the flow secrets.
 * The code exchange itself is still the `under_development` stub in
 * `lib/banking/altareq.ts`, so today this ends on the error redirect.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const dashboard = (status: string) => NextResponse.redirect(new URL(`/dashboard?bank=${status}`, url));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));
  if (await needsMfaStepUp(supabase)) return NextResponse.redirect(new URL("/login/mfa", url));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || url.searchParams.get("error")) return dashboard("error");

  const service = createServiceClient();
  const { data: pending } = await service
    .from("bank_connections")
    .select("id, encrypted_code_verifier, oauth_started_at")
    .eq("profile_id", user.id)
    .eq("status", "pending")
    .eq("oauth_state", state)
    .maybeSingle();

  const started = pending?.oauth_started_at ? Date.parse(pending.oauth_started_at) : 0;
  if (!pending || !pending.encrypted_code_verifier || Date.now() - started > FLOW_TTL_MS) {
    return dashboard("error");
  }

  const exchanged = await exchangeAuthorizationCode({
    code,
    verifier: decryptSecret(pending.encrypted_code_verifier),
  });
  if (!exchanged.ok) {
    await service
      .from("bank_connections")
      .update({ status: "error", last_sync_status: "error", last_sync_error: exchanged.error, oauth_state: null, encrypted_code_verifier: null })
      .eq("id", pending.id);
    return dashboard("error");
  }

  const { tokens } = exchanged;
  await service
    .from("bank_connections")
    .update({
      status: "active",
      encrypted_access_token: encryptSecret(tokens.accessToken),
      encrypted_refresh_token: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
      token_expires_at: new Date(tokens.expiresAt).toISOString(),
      consent_id: tokens.consentId,
      consent_expires_at: tokens.consentExpiresAt ? new Date(tokens.consentExpiresAt).toISOString() : null,
      oauth_state: null,
      encrypted_code_verifier: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pending.id);
  return dashboard("connected");
}
