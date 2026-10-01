"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/utils/supabase/service";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import {
  buildAuthorizationUrl,
  createPkcePair,
  fetchAccounts,
  fetchBalances,
  getBankSyncMode,
  listInstitutions,
  sandboxTokenSet,
  refreshAccessToken,
  type AltareqErrorCode,
  type BankAccount,
  type BankInstitution,
  type BankSyncMode,
} from "@/lib/banking/altareq";
import { decryptSecret, encryptSecret, isTokenCryptoConfigured } from "@/lib/banking/token-crypto";
import type { AssetHistorySource } from "@/lib/asset-history";

type Fail = { ok: false; code: AltareqErrorCode | "unauthenticated" | "invalid" | "db_error" | "crypto_not_configured"; error: string };

/** Every banking action needs a signed-in session that has completed MFA step-up. */
async function requireUser(): Promise<{ ok: true; userId: string; userClient: Awaited<ReturnType<typeof createClient>> } | Fail> {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated", error: "You must be signed in." };
  if (await needsMfaStepUp(userClient)) {
    return { ok: false, code: "unauthenticated", error: "Complete two-factor verification first." };
  }
  return { ok: true, userId: user.id, userClient };
}

export async function listBankInstitutions(): Promise<
  { ok: true; mode: BankSyncMode; institutions: BankInstitution[] } | Fail
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const mode = getBankSyncMode();
  if (mode === "unconfigured") {
    return { ok: false, code: "provider_not_configured", error: "Open Finance sync isn't configured on this deployment." };
  }
  const result = await listInstitutions();
  if (!result.ok) return result;
  return { ok: true, mode, institutions: result.institutions };
}

/**
 * Starts a bank connection. Live mode: stores a pending connection (state +
 * ENCRYPTED PKCE verifier) and returns the bank's authorization URL for the
 * browser to follow; the callback route finishes it. Sandbox mode (dev): the
 * consent is granted at once, the sandbox accounts are created as asset-LESS
 * links (`is_sandbox`, see migration 0020) and synced — they live only in the
 * banking view and can never reach an asset or net worth.
 */
export async function startBankConnection(institutionId: string): Promise<
  | { ok: true; kind: "redirect"; url: string }
  | { ok: true; kind: "connected"; connectionId: string; isSandbox: boolean; accounts: BankAccount[]; autoLinked: boolean }
  | Fail
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const mode = getBankSyncMode();
  if (mode === "unconfigured") {
    return { ok: false, code: "provider_not_configured", error: "Open Finance sync isn't configured on this deployment." };
  }

  const institutions = await listInstitutions();
  if (!institutions.ok) return institutions;
  const institution = institutions.institutions.find((i) => i.id === institutionId);
  if (!institution) return { ok: false, code: "invalid", error: "Unknown bank." };

  const service = createServiceClient();

  // Sandbox accepts every bank; a LIVE connection needs the bank's provider to
  // be implemented — only Al Tareq (UAE) is (as a stub); French banks need an
  // EU open-banking (PSD2) provider that hasn't been chosen or integrated.
  if (mode !== "sandbox" && institution.provider !== "altareq") {
    return {
      ok: false,
      code: "provider_not_configured",
      error: "Live sync for French banks needs an EU open-banking (PSD2) provider, which isn't set up. Use a CSV statement import for now.",
    };
  }

  if (mode === "sandbox") {
    const tokens = sandboxTokenSet();
    const { data: row, error } = await service
      .from("bank_connections")
      .insert({
        profile_id: auth.userId,
        provider: institution.provider,
        institution_id: institution.id,
        institution_name: institution.name,
        status: "active",
        is_sandbox: true,
        consent_id: tokens.consentId,
        consent_expires_at: new Date(tokens.consentExpiresAt!).toISOString(),
      })
      .select("id")
      .single<{ id: string }>();
    if (error) return { ok: false, code: "db_error", error: error.message };
    const accounts = await fetchAccounts(institution.id, "");
    if (!accounts.ok) return accounts;
    const { error: linkError } = await service.from("bank_account_links").insert(
      accounts.accounts.map((a) => ({
        profile_id: auth.userId,
        connection_id: row.id,
        asset_id: null,
        is_sandbox: true,
        external_account_id: a.externalId,
        account_label: a.label,
        masked_number: a.maskedNumber,
        currency: a.currency,
      })),
    );
    if (linkError) return { ok: false, code: "db_error", error: linkError.message };
    await syncBankConnection(row.id);
    return {
      ok: true,
      kind: "connected",
      connectionId: row.id,
      isSandbox: true,
      accounts: accounts.accounts,
      autoLinked: true,
    };
  }

  if (!isTokenCryptoConfigured()) {
    return { ok: false, code: "crypto_not_configured", error: "BANK_TOKEN_ENCRYPTION_KEY is not set, so tokens can't be stored safely." };
  }
  const pkce = createPkcePair();
  const url = buildAuthorizationUrl({ institutionId: institution.id, state: pkce.state, challenge: pkce.challenge });
  if (!url.ok) return url;
  const { error } = await service.from("bank_connections").insert({
    profile_id: auth.userId,
    institution_id: institution.id,
    institution_name: institution.name,
    status: "pending",
    oauth_state: pkce.state,
    encrypted_code_verifier: encryptSecret(pkce.verifier),
    oauth_started_at: new Date().toISOString(),
  });
  if (error) return { ok: false, code: "db_error", error: error.message };
  return { ok: true, kind: "redirect", url: url.url };
}

export type AccountMapping = {
  account: BankAccount;
  /** An existing Cash asset id, or "new" to create one (live connections only). */
  assetId: string | "new";
};

/** Links bank accounts of a LIVE connection to Cash assets. Sandbox connections are linked automatically, asset-less, and are rejected here. */
export async function linkBankAccounts(
  connectionId: string,
  mappings: AccountMapping[],
): Promise<{ ok: true; linked: number } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const service = createServiceClient();

  const { data: connection } = await service
    .from("bank_connections")
    .select("id, institution_name, is_sandbox")
    .eq("id", connectionId)
    .eq("profile_id", auth.userId)
    .single<{ id: string; institution_name: string; is_sandbox: boolean }>();
  if (!connection) return { ok: false, code: "invalid", error: "Connection not found." };
  if (connection.is_sandbox) {
    return { ok: false, code: "invalid", error: "Sandbox accounts are never linked to your real accounts." };
  }

  const { data: cash } = await auth.userClient
    .from("asset_categories")
    .select("id")
    .eq("name", "Cash")
    .single<{ id: string }>();
  if (!cash) return { ok: false, code: "invalid", error: 'The "Cash" category is missing.' };

  let linked = 0;
  for (const { account, assetId } of mappings) {
    let targetId = assetId;
    if (assetId === "new") {
      const { data: created, error } = await auth.userClient
        .from("assets")
        .insert({
          profile_id: auth.userId,
          category_id: cash.id,
          name: `${connection.institution_name} – ${account.label}`,
          quantity: 1,
          current_value: 0,
          currency: account.currency,
          metadata: {},
          images: [],
          ticker_symbol: null,
          purchase_date: new Date().toISOString().slice(0, 10),
        })
        .select("id")
        .single<{ id: string }>();
      if (error) return { ok: false, code: "db_error", error: error.message };
      targetId = created.id;
    } else {
      const { data: asset } = await auth.userClient
        .from("assets")
        .select("id")
        .eq("id", assetId)
        .eq("profile_id", auth.userId)
        .eq("category_id", cash.id)
        .single<{ id: string }>();
      if (!asset) return { ok: false, code: "invalid", error: "Pick one of your Cash accounts." };
    }

    const { error } = await service.from("bank_account_links").insert({
      profile_id: auth.userId,
      connection_id: connectionId,
      asset_id: targetId,
      is_sandbox: false,
      external_account_id: account.externalId,
      account_label: account.label,
      masked_number: account.maskedNumber,
      currency: account.currency,
    });
    if (error) return { ok: false, code: "db_error", error: error.message };
    linked += 1;
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, linked };
}

async function writeBalanceToAsset(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  assetId: string,
  balance: number,
  asOf: string,
): Promise<string | null> {
  const { error: updateError } = await service
    .from("assets")
    .update({ current_value: balance })
    .eq("id", assetId)
    .eq("profile_id", userId);
  if (updateError) return updateError.message;

  const row = {
    asset_id: assetId,
    recorded_date: asOf.slice(0, 10),
    value: balance,
    net_equity: balance,
  };
  let { error } = await service
    .from("asset_history")
    .upsert({ ...row, source: "open_finance" satisfies AssetHistorySource }, { onConflict: "asset_id,recorded_date" });
  // 0020 widens the CHECK; until it's applied fall back to 'manual' so the balance still lands.
  if (error?.code === "23514") {
    ({ error } = await service
      .from("asset_history")
      .upsert({ ...row, source: "manual" }, { onConflict: "asset_id,recorded_date" }));
  }
  return error?.message ?? null;
}

/**
 * Polls the bank for every linked account of one connection. Live: refreshes
 * the access token when it is about to expire, then for each account writes
 * the reported balance onto the Cash asset (+ today's history row) — refusing
 * to write when the bank's currency differs from the asset's. Sandbox: stores
 * the sandbox balance on the link only; there is no asset to touch.
 */
export async function syncBankConnection(connectionId: string): Promise<
  { ok: true; synced: number; isSandbox: boolean } | Fail
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const service = createServiceClient();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const { data: connection } = await service
    .from("bank_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("profile_id", auth.userId)
    .single();
  if (!connection) return { ok: false, code: "invalid", error: "Connection not found." };

  const { data: links } = await service
    .from("bank_account_links")
    .select("*")
    .eq("connection_id", connectionId)
    .eq("profile_id", auth.userId);
  if (!links || links.length === 0) return { ok: true, synced: 0, isSandbox: connection.is_sandbox };

  const accounts: BankAccount[] = links.map((l) => ({
    externalId: l.external_account_id,
    label: l.account_label ?? "",
    currency: l.currency ?? "AED",
    type: "current",
    maskedNumber: l.masked_number ?? "",
  }));

  async function recordFailure(code: string, message: string) {
    await service
      .from("bank_connections")
      .update({
        last_sync_status: "error",
        last_sync_error: message,
        status: code === "consent_expired" || code === "unauthorized" ? "expired" : connection!.status,
        updated_at: now,
      })
      .eq("id", connectionId);
    await service
      .from("bank_account_links")
      .update({ last_sync_status: "error", last_sync_error: message })
      .eq("connection_id", connectionId);
    revalidatePath("/dashboard", "layout");
  }

  // Access token (live only): decrypt, refresh when near expiry.
  let accessToken = "";
  if (!connection.is_sandbox) {
    if (!connection.encrypted_access_token || !isTokenCryptoConfigured()) {
      await recordFailure("unauthorized", "No usable access token — reconnect the bank.");
      return { ok: false, code: "unauthorized", error: "No usable access token — reconnect the bank." };
    }
    accessToken = decryptSecret(connection.encrypted_access_token);
    const expiring = !connection.token_expires_at || Date.parse(connection.token_expires_at) < Date.now() + 60_000;
    if (expiring) {
      if (!connection.encrypted_refresh_token) {
        await recordFailure("consent_expired", "The bank session expired — reconnect the bank.");
        return { ok: false, code: "consent_expired", error: "The bank session expired — reconnect the bank." };
      }
      const refreshed = await refreshAccessToken(decryptSecret(connection.encrypted_refresh_token));
      if (!refreshed.ok) {
        await recordFailure(refreshed.code, refreshed.error);
        return refreshed;
      }
      accessToken = refreshed.tokens.accessToken;
      await service
        .from("bank_connections")
        .update({
          encrypted_access_token: encryptSecret(refreshed.tokens.accessToken),
          encrypted_refresh_token: refreshed.tokens.refreshToken ? encryptSecret(refreshed.tokens.refreshToken) : connection.encrypted_refresh_token,
          token_expires_at: new Date(refreshed.tokens.expiresAt).toISOString(),
        })
        .eq("id", connectionId);
    }
  }

  const balances = await fetchBalances(connection.institution_id, accessToken, accounts, today);
  if (!balances.ok) {
    await recordFailure(balances.code, balances.error);
    return balances;
  }

  let synced = 0;
  for (const link of links) {
    const balance = balances.balances.find((b) => b.externalId === link.external_account_id);
    if (!balance) {
      await service
        .from("bank_account_links")
        .update({ last_sync_status: "error", last_sync_error: "The bank returned no balance for this account." })
        .eq("id", link.id);
      continue;
    }
    let error: string | null = null;
    if (!connection.is_sandbox && link.asset_id) {
      const { data: asset } = await service
        .from("assets")
        .select("currency")
        .eq("id", link.asset_id)
        .eq("profile_id", auth.userId)
        .single<{ currency: string }>();
      if (asset && asset.currency !== balance.currency) {
        error = `Currency mismatch: the bank reports ${balance.currency}, this account is ${asset.currency}.`;
      } else {
        error = await writeBalanceToAsset(service, auth.userId, link.asset_id, balance.amount, balance.asOf);
      }
    }
    await service
      .from("bank_account_links")
      .update({
        last_balance: balance.amount,
        last_synced_at: now,
        last_sync_status: error ? "error" : "ok",
        last_sync_error: error,
      })
      .eq("id", link.id);
    if (!error) synced += 1;
  }

  await service
    .from("bank_connections")
    .update({ last_synced_at: now, last_sync_status: "ok", last_sync_error: null, status: "active", updated_at: now })
    .eq("id", connectionId);

  revalidatePath("/dashboard", "layout");
  return { ok: true, synced, isSandbox: connection.is_sandbox };
}

/**
 * Removes the connection and its links (the Cash assets and their history are
 * kept). NOTE: this does not yet revoke the consent at the bank — that needs
 * the live API; until then, also revoke it in the bank's own app.
 */
export async function disconnectBank(connectionId: string): Promise<{ ok: true } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { error } = await auth.userClient
    .from("bank_connections")
    .delete()
    .eq("id", connectionId)
    .eq("profile_id", auth.userId);
  if (error) return { ok: false, code: "db_error", error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Remembers which bank (CSV profile) and account identifier a Cash account
 * comes from, in its `metadata` (`bank_profile`, `account_ref`), so the next
 * statement for that account is routed to it automatically
 * (`routeGroup` in `lib/banking/csv-profiles.ts`). Cash accounts only.
 */
export async function rememberCashAccountBank(
  assetId: string,
  bankProfile: string,
  accountRef: string,
): Promise<{ ok: true } | Fail> {
  const auth = await requireUser();
  if (!auth.ok) return auth;

  const { data: asset } = await auth.userClient
    .from("assets")
    .select("id, metadata, asset_categories(name)")
    .eq("id", assetId)
    .eq("profile_id", auth.userId)
    .single<{ id: string; metadata: Record<string, unknown> | null; asset_categories: { name: string } | null }>();
  if (!asset || asset.asset_categories?.name !== "Cash") {
    return { ok: false, code: "invalid", error: "Cash account not found." };
  }

  const metadata = {
    ...(asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {}),
    bank_profile: bankProfile,
    ...(accountRef ? { account_ref: accountRef } : {}),
  };
  const { error } = await auth.userClient
    .from("assets")
    .update({ metadata: metadata as never })
    .eq("id", assetId)
    .eq("profile_id", auth.userId);
  if (error) return { ok: false, code: "db_error", error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
