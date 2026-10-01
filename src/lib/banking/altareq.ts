/**
 * UAE Open Finance (Al Tareq) bank-sync service layer.
 *
 * Server-only module (reads secrets from `process.env`; imports `node:crypto`):
 * import it only from Server Actions / Route Handlers.
 *
 * WHAT THIS IS, HONESTLY. Al Tareq is the UAE Open Finance trust framework run
 * for the Central Bank (CBUAE). Production access is for REGISTERED third-party
 * providers: you must be onboarded in the framework's directory, hold
 * certificates for mutual-TLS (mTLS) and sign requests per its FAPI-based
 * security profile. That onboarding has NOT happened for Opes Wealth, and the
 * exact endpoint paths/scopes/field names below are modelled on the generic
 * Open Finance account-information pattern (OAuth2 authorization-code + PKCE,
 * then accounts → balances), NOT verified against the live Al Tareq
 * specification. So, same posture as `lib/services/dld-client.ts`:
 *
 *   - the CONTRACT (types, functions, error codes, PKCE/consent handling,
 *     encrypted token storage, polling orchestration in the server actions)
 *     is real and final;
 *   - the network call itself (`callAltareq`) is a clearly-marked stub that
 *     returns `under_development` until onboarding, mTLS certificates and the
 *     real spec exist;
 *   - a deterministic SANDBOX mode (`ALTAREQ_SANDBOX_MODE=true`) exists for
 *     development. Sandbox data is NEVER written to the user's real assets or
 *     history (the 2026-09 incident where a mock DLD valuation overwrote a real
 *     property is the reason): it is only displayed.
 *
 * Environment (all server-side):
 *   ALTAREQ_SANDBOX_MODE      "true" to use sandbox banks/balances (dev only)
 *   ALTAREQ_CLIENT_ID      OAuth client id issued at onboarding
 *   ALTAREQ_AUTH_URL       the bank/authorization-server authorization endpoint
 *   ALTAREQ_TOKEN_URL      token endpoint
 *   ALTAREQ_API_BASE_URL   account-information API base URL
 *   ALTAREQ_REDIRECT_URI   registered redirect, e.g. https://www.opeswealth.app/dashboard/banking/callback
 *   ALTAREQ_CLIENT_CERT / ALTAREQ_CLIENT_KEY   PEM for mTLS (not yet used — see callAltareq)
 *   BANK_TOKEN_ENCRYPTION_KEY                  see token-crypto.ts
 */
import { createHash, randomBytes } from "node:crypto";
import {
  BANKS,
  bankFromInstitutionId,
  type BankProvider,
  type BankSyncMode,
} from "@/lib/banking/institutions";

export type AltareqErrorCode =
  | "provider_not_configured"
  | "under_development"
  | "consent_expired"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "invalid_response"
  | "timeout"
  | "network_error";

export type AltareqResult<T> =
  | ({ ok: true; isSandbox: boolean } & T)
  | { ok: false; code: AltareqErrorCode; error: string };

export type BankInstitution = { id: string; name: string; provider: BankProvider };

export type BankAccount = {
  /** The provider's stable account identifier (never a full account number). */
  externalId: string;
  label: string;
  currency: string;
  type: "current" | "savings" | "credit_card" | "other";
  /** Last digits only, for the user to recognise the account. */
  maskedNumber: string;
};

export type BankBalance = {
  externalId: string;
  amount: number;
  currency: string;
  /** ISO timestamp of the balance. */
  asOf: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms. */
  expiresAt: number;
  /** Consent end (epoch ms) when the provider reports one. */
  consentExpiresAt: number | null;
  consentId: string | null;
};

// --- Mode ---------------------------------------------------------------

export function isAltareqSandboxMode(): boolean {
  return process.env.ALTAREQ_SANDBOX_MODE === "true";
}

export function isAltareqConfigured(): boolean {
  return Boolean(
    process.env.ALTAREQ_CLIENT_ID &&
      process.env.ALTAREQ_AUTH_URL &&
      process.env.ALTAREQ_TOKEN_URL &&
      process.env.ALTAREQ_API_BASE_URL &&
      process.env.ALTAREQ_REDIRECT_URI,
  );
}


export function getBankSyncMode(): BankSyncMode {
  if (isAltareqSandboxMode()) return "sandbox";
  return isAltareqConfigured() ? "live" : "unconfigured";
}

// --- Sandbox data (development only; never persisted to assets) -----------

/**
 * Every bank in the registry gets a sandbox twin — UAE banks (Al Tareq) AND
 * French banks (PSD2). The French ones exist as sandbox stubs only: no EU
 * open-banking provider is integrated, so they can never connect live.
 */
const SANDBOX_INSTITUTIONS: BankInstitution[] = BANKS.map((b) => ({
  id: `sandbox-${b.key}`,
  name: b.name,
  provider: b.provider,
}));

function seedFrom(text: string): number {
  return createHash("sha256").update(text).digest().readUInt32BE(0);
}

function sandboxAccounts(institutionId: string): BankAccount[] {
  const seed = seedFrom(institutionId);
  // A French sandbox bank holds euros, a UAE one dirhams.
  const currency = bankFromInstitutionId(institutionId)?.defaultCurrency ?? "AED";
  return [
    {
      externalId: `${institutionId}-current`,
      label: "Current account",
      currency,
      type: "current",
      maskedNumber: `••••${String(1000 + (seed % 9000))}`,
    },
    {
      externalId: `${institutionId}-savings`,
      label: "Savings account",
      currency,
      type: "savings",
      maskedNumber: `••••${String(1000 + ((seed >> 8) % 9000))}`,
    },
  ];
}

/** Deterministic, slowly-drifting sandbox balance: stable within a day, different across days. */
function sandboxBalance(externalId: string, today: string): number {
  const base = 20_000 + (seedFrom(externalId) % 180_000);
  const drift = (seedFrom(`${externalId}:${today}`) % 4000) - 2000;
  return Math.round((base + drift) * 100) / 100;
}

// --- PKCE / authorization ---------------------------------------------------

export type PkcePair = { verifier: string; challenge: string; state: string };

/** RFC 7636 S256 challenge plus an unguessable `state` (CSRF protection for the redirect). */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(24).toString("base64url") };
}

export function buildAuthorizationUrl(opts: {
  institutionId: string;
  state: string;
  challenge: string;
}): AltareqResult<{ url: string }> {
  if (!isAltareqConfigured()) {
    return { ok: false, code: "provider_not_configured", error: "Open Finance credentials are not configured." };
  }
  const url = new URL(process.env.ALTAREQ_AUTH_URL!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.ALTAREQ_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.ALTAREQ_REDIRECT_URI!);
  url.searchParams.set("scope", "openid accounts");
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("institution", opts.institutionId);
  return { ok: true, isSandbox: false, url: url.toString() };
}

// --- The one network function (stub) -------------------------------------------

/**
 * Every real request goes through here. NOT IMPLEMENTED: a real call needs the
 * onboarding described in the file header — an mTLS client certificate (a
 * Node `undici` dispatcher with `connect: { cert, key }`), the registered
 * client, and the actual Al Tareq paths and payloads. Until then it reports
 * `under_development` instead of guessing.
 */
async function callAltareq(): Promise<never> {
  throw new AltareqError(
    "under_development",
    "The live Al Tareq connection is not implemented yet (needs provider onboarding, mTLS certificates and the official API specification).",
  );
}

export class AltareqError extends Error {
  code: AltareqErrorCode;
  constructor(code: AltareqErrorCode, message: string) {
    super(message);
    this.name = "AltareqError";
    this.code = code;
  }
}

function fail<T>(e: unknown): AltareqResult<T> {
  if (e instanceof AltareqError) return { ok: false, code: e.code, error: e.message };
  return { ok: false, code: "network_error", error: e instanceof Error ? e.message : "Request failed." };
}

// --- Public operations ------------------------------------------------------------

export async function listInstitutions(): Promise<AltareqResult<{ institutions: BankInstitution[] }>> {
  if (isAltareqSandboxMode()) return { ok: true, isSandbox: true, institutions: SANDBOX_INSTITUTIONS };
  if (!isAltareqConfigured()) {
    return { ok: false, code: "provider_not_configured", error: "Open Finance credentials are not configured." };
  }
  try {
    return await callAltareq();
  } catch (e) {
    return fail(e);
  }
}

/** Sandbox mode skips the redirect: the "consent" is granted immediately, for 90 days. */
export function sandboxTokenSet(): TokenSet {
  const now = Date.now();
  return {
    accessToken: "sandbox-access-token",
    refreshToken: null,
    expiresAt: now + 3600_000,
    consentExpiresAt: now + 90 * 24 * 3600_000,
    consentId: `sandbox-consent-${randomBytes(6).toString("hex")}`,
  };
}

export async function exchangeAuthorizationCode(_opts: {
  code: string;
  verifier: string;
}): Promise<AltareqResult<{ tokens: TokenSet }>> {
  void _opts;
  try {
    return await callAltareq();
  } catch (e) {
    return fail(e);
  }
}

export async function refreshAccessToken(_refreshToken: string): Promise<AltareqResult<{ tokens: TokenSet }>> {
  void _refreshToken;
  try {
    return await callAltareq();
  } catch (e) {
    return fail(e);
  }
}

export async function fetchAccounts(
  institutionId: string,
  _accessToken: string,
): Promise<AltareqResult<{ accounts: BankAccount[] }>> {
  void _accessToken;
  if (isAltareqSandboxMode() && institutionId.startsWith("sandbox-")) {
    return { ok: true, isSandbox: true, accounts: sandboxAccounts(institutionId) };
  }
  try {
    return await callAltareq();
  } catch (e) {
    return fail(e);
  }
}

export async function fetchBalances(
  institutionId: string,
  _accessToken: string,
  accounts: BankAccount[],
  today: string,
): Promise<AltareqResult<{ balances: BankBalance[] }>> {
  void _accessToken;
  if (isAltareqSandboxMode() && institutionId.startsWith("sandbox-")) {
    return {
      ok: true,
      isSandbox: true,
      balances: accounts.map((a) => ({
        externalId: a.externalId,
        amount: sandboxBalance(a.externalId, today),
        currency: a.currency,
        asOf: new Date().toISOString(),
      })),
    };
  }
  try {
    return await callAltareq();
  } catch (e) {
    return fail(e);
  }
}

export type { BankSyncMode } from "@/lib/banking/institutions";
