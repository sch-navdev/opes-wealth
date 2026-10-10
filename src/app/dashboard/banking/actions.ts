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
import { cleanSourceRef, isMissingColumnError, type AssetHistorySource } from "@/lib/asset-history";
import { isDemoUser } from "@/lib/demo-mode";
import { currentRef, mergeRefHistory, parseRefHistory } from "@/lib/banking/rollover";

type Fail = { ok: false; code: AltareqErrorCode | "unauthenticated" | "invalid" | "db_error" | "crypto_not_configured"; error: string };

/** Every banking action needs a signed-in session that has completed MFA step-up. */
async function requireUser(write = false): Promise<{ ok: true; userId: string; userClient: Awaited<ReturnType<typeof createClient>> } | Fail> {
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated", error: "You must be signed in." };
  if (await needsMfaStepUp(userClient)) {
    return { ok: false, code: "unauthenticated", error: "Complete two-factor verification first." };
  }
  if (write && isDemoUser(user.id)) {
    return { ok: false, code: "unauthenticated", error: "Bank connections are switched off in the demo account." };
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
  const auth = await requireUser(true);
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
  const auth = await requireUser(true);
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
  const auth = await requireUser(true);
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
  const auth = await requireUser(true);
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
  const auth = await requireUser(true);
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

/**
 * Merges several of the user's Cash accounts of the same currency into ONE (the accounts of a savings space that
 * was closed and reopened under new numbers, a replaced card): the account with the most recent balance date is
 * kept and renamed, the others' transactions and balance history move into it (a date it already has is kept
 * as is), every old number goes into its `ref_history`, and the emptied accounts are deleted. Own accounts only;
 * uses the service client for the move because the transactions table has no update policy, after checking
 * ownership of every account explicitly.
 */
export async function mergeCashAccounts(
  accountIds: string[],
  name: string,
): Promise<{ ok: true; keptId: string } | Fail> {
  const ids = [...new Set(accountIds)];
  const newName = name.trim();
  if (ids.length < 2 || ids.length > 30) return { ok: false, code: "invalid", error: "Choose between 2 and 30 accounts to merge." };
  if (newName.length < 1 || newName.length > 120) return { ok: false, code: "invalid", error: "Give the merged account a name." };
  const auth = await requireUser(true);
  if (!auth.ok) return auth;
  const db = createServiceClient();

  type Row = { id: string; name: string; currency: string; current_value: number; metadata: Record<string, unknown> | null; updated_at: string | null; is_liability: boolean; asset_categories: { name: string } | null };
  const { data: found } = await db
    .from("assets")
    .select("id, name, currency, current_value, metadata, updated_at, is_liability, asset_categories(name)")
    .in("id", ids)
    .eq("profile_id", auth.userId)
    .returns<Row[]>();
  const rows = found ?? [];
  if (rows.length !== ids.length || rows.some((r) => r.asset_categories?.name !== "Cash" || r.is_liability)) {
    return { ok: false, code: "invalid", error: "Only your own bank (Cash) accounts can be merged." };
  }
  if (new Set(rows.map((r) => r.currency.toUpperCase())).size !== 1) {
    return { ok: false, code: "invalid", error: "The accounts must all be in the same currency." };
  }

  const { data: historyRows, error: histError } = await db.from("asset_history").select("*").in("asset_id", ids);
  if (histError) return { ok: false, code: "db_error", error: histError.message };
  const history = (historyRows ?? []) as Record<string, unknown>[];
  const datesOf = (assetId: string) => history.filter((h) => h.asset_id === assetId).map((h) => String(h.recorded_date)).sort();
  const lastDate = (r: Row) => datesOf(r.id).at(-1) ?? (r.updated_at ?? "").slice(0, 10);

  const kept = [...rows].sort((a, b) => lastDate(b).localeCompare(lastDate(a)))[0];
  const others = rows.filter((r) => r.id !== kept.id);
  const otherIds = others.map((r) => r.id);

  // Every account's own number(s), each with the period its statements covered.
  let refHistory = parseRefHistory(kept.metadata?.ref_history);
  for (const r of rows) {
    const dates = datesOf(r.id);
    const ref = typeof r.metadata?.account_ref === "string" ? r.metadata.account_ref : "";
    const own = [...(ref ? [ref] : []), ...parseRefHistory(r.metadata?.ref_history).map((e) => e.ref)];
    refHistory = mergeRefHistory(refHistory, [
      ...own.map((x) => ({ ref: x, from: dates[0] ?? null, to: dates.at(-1) ?? null })),
    ]);
  }
  const latest = currentRef(refHistory);

  // Move the transactions, then the balance dates the kept account does not have yet.
  const { error: txError } = await db.from("transactions").update({ asset_id: kept.id }).in("asset_id", otherIds).eq("profile_id", auth.userId);
  if (txError && !/relation .* does not exist|schema cache/i.test(txError.message)) return { ok: false, code: "db_error", error: txError.message };
  const have = new Set(datesOf(kept.id));
  const toCopy = history
    .filter((h) => h.asset_id !== kept.id && !have.has(String(h.recorded_date)))
    .map((h) => {
      const { id: _id, asset_id: _asset, ...rest } = h;
      void _id;
      void _asset;
      return { ...rest, asset_id: kept.id };
    });
  for (let i = 0; i < toCopy.length; i += 500) {
    const { error } = await db.from("asset_history").insert(toCopy.slice(i, i + 500) as never);
    if (error) return { ok: false, code: "db_error", error: error.message };
  }

  const keptMeta = kept.metadata && typeof kept.metadata === "object" ? kept.metadata : {};
  const { error: updError } = await db
    .from("assets")
    .update({ name: newName, metadata: { ...keptMeta, ref_history: refHistory, ...(latest ? { account_ref: latest } : {}) } as never })
    .eq("id", kept.id)
    .eq("profile_id", auth.userId);
  if (updError) return { ok: false, code: "db_error", error: updError.message };

  const { error: delError } = await db.from("assets").delete().in("id", otherIds).eq("profile_id", auth.userId);
  if (delError) return { ok: false, code: "db_error", error: delError.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, keptId: kept.id };
}

/**
 * Records the account / card numbers that belong to ONE Cash account (a savings space renewed under a new number,
 * a replaced card): each entry is the period a number was in use. The account's current number becomes the one
 * whose period ends latest (the most recent statement date wins), the older ones stay in `metadata.ref_history`
 * so old statements still route here. Own profile only.
 */
export async function mergeAccountRefs(
  assetId: string,
  entries: { ref: string; from: string | null; to: string | null }[],
): Promise<{ ok: true } | Fail> {
  const clean = entries.filter((e) => e.ref.trim() !== "" && e.ref.length <= 64);
  if (clean.length === 0) return { ok: true };
  const auth = await requireUser(true);
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
  const current = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  const history = mergeRefHistory(parseRefHistory(current.ref_history), clean);
  const latest = currentRef(history);
  const { error } = await auth.userClient
    .from("assets")
    .update({ metadata: { ...current, ref_history: history, ...(latest ? { account_ref: latest } : {}) } as never })
    .eq("id", assetId)
    .eq("profile_id", auth.userId);
  if (error) return { ok: false, code: "db_error", error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Marks a Cash account as closed (`metadata.closed_on`, ISO date) after a statement printed an account
 * closure date. The account is hidden on the Banking page unless "Show closed accounts" is on; its
 * history stays. Never overwrites an earlier closure date. Own profile only.
 */
export async function markCashAccountClosed(assetId: string, closedOn: string): Promise<{ ok: true } | Fail> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) return { ok: false, code: "invalid", error: "Invalid closure date." };
  const auth = await requireUser(true);
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
  const current = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  if (typeof current.closed_on === "string") return { ok: true };

  const { error } = await auth.userClient
    .from("assets")
    .update({ metadata: { ...current, closed_on: closedOn } as never })
    .eq("id", assetId)
    .eq("profile_id", auth.userId);
  if (error) return { ok: false, code: "db_error", error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Creates an empty manual Cash account for a statement group that has no account yet (balance 0; the
 * import then records the statement's history and balance). Own profile only, never the demo account.
 */
export async function createStatementCashAccount(input: {
  name: string;
  currency: string;
  bankProfile: string;
  institutionName: string;
  accountRef: string;
}): Promise<{ ok: true; id: string } | Fail> {
  const auth = await requireUser(true);
  if (!auth.ok) return auth;

  const name = input.name.trim().slice(0, 120);
  const currency = input.currency.trim().toUpperCase();
  if (!name) return { ok: false, code: "invalid", error: "Name is required." };
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, code: "invalid", error: "Invalid currency." };
  const accountRef = input.accountRef.replace(/\s+/g, "").slice(0, 40);

  const { data: category } = await auth.userClient
    .from("asset_categories")
    .select("id")
    .eq("name", "Cash")
    .single<{ id: string }>();
  if (!category) return { ok: false, code: "db_error", error: 'The "Cash" category is missing from this project.' };

  const { data: inserted, error } = await auth.userClient
    .from("assets")
    .insert({
      profile_id: auth.userId,
      category_id: category.id,
      name,
      quantity: 1,
      current_value: 0,
      currency,
      is_liability: false,
      metadata: {
        institution_name: input.institutionName.slice(0, 100),
        account_type: "current",
        bank_profile: input.bankProfile.slice(0, 40),
        ...(accountRef ? { account_ref: accountRef } : {}),
      } as never,
      images: [],
      ticker_symbol: null,
      purchase_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !inserted) return { ok: false, code: "db_error", error: error?.message ?? "Could not create the account." };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: inserted.id };
}

/**
 * Records dated balances (a statement's balance brought forward / closing balance) for a Cash account
 * that has no transactions in the statement. A date that already has a history row is left alone (so
 * nothing is overwritten); the account's current value only follows the newest point when no later
 * history row exists.
 */
export async function recordBalanceSnapshots(
  assetId: string,
  points: { date: string; value: number }[],
  options: { source?: "csv_import" | "pdf_import"; fileName?: string } = {},
): Promise<{ ok: true; added: number; skipped: number } | Fail> {
  const auth = await requireUser(true);
  if (!auth.ok) return auth;

  const clean = points.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value));
  if (clean.length === 0 || clean.length > 4) return { ok: false, code: "invalid", error: "No valid balance to record." };

  const { data: asset } = await auth.userClient
    .from("assets")
    .select("id, asset_categories(name)")
    .eq("id", assetId)
    .eq("profile_id", auth.userId)
    .single<{ id: string; asset_categories: { name: string } | null }>();
  if (!asset || asset.asset_categories?.name !== "Cash") {
    return { ok: false, code: "invalid", error: "Cash account not found." };
  }

  const { data: existing, error: readError } = await auth.userClient
    .from("asset_history")
    .select("recorded_date")
    .eq("asset_id", assetId)
    .returns<{ recorded_date: string }[]>();
  if (readError) return { ok: false, code: "db_error", error: readError.message };
  const have = new Set((existing ?? []).map((r) => r.recorded_date));
  const latestExisting = (existing ?? []).reduce((m, r) => (r.recorded_date > m ? r.recorded_date : m), "");

  const fresh = clean.filter((p) => !have.has(p.date));
  const skipped = clean.length - fresh.length;
  if (fresh.length > 0) {
    const firstSource: AssetHistorySource = options.source === "pdf_import" ? "pdf_import" : "csv_import";
    const sourceRef = cleanSourceRef(options.fileName);
    const write = (source: AssetHistorySource, withRef: boolean) =>
      auth.userClient.from("asset_history").insert(
        fresh.map((p) => ({
          asset_id: assetId,
          recorded_date: p.date,
          value: p.value,
          net_equity: p.value,
          source,
          ...(withRef && sourceRef ? { source_ref: sourceRef } : {}),
        })),
      );
    let withRef = true;
    let { error } = await write(firstSource, withRef);
    // Migration 0041 not applied yet: write the rows without the file name.
    if (isMissingColumnError(error, "source_ref")) {
      withRef = false;
      ({ error } = await write(firstSource, withRef));
    }
    if (error?.code === "23514") ({ error } = await write("manual", withRef));
    if (error) return { ok: false, code: "db_error", error: error.message };

    const newest = fresh.reduce((m, p) => (p.date > m.date ? p : m));
    if (newest.date >= latestExisting) {
      const { error: updateError } = await auth.userClient
        .from("assets")
        .update({ current_value: newest.value })
        .eq("id", assetId)
        .eq("profile_id", auth.userId);
      if (updateError) return { ok: false, code: "db_error", error: updateError.message };
    }
  }
  revalidatePath("/dashboard", "layout");
  revalidatePath(`/dashboard/assets/${assetId}`);
  return { ok: true, added: fresh.length, skipped };
}
