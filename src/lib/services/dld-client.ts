/**
 * Dubai Land Department (DLD) / RERA integration client.
 *
 * Server-only module — reads real secrets (`DLD_CLIENT_ID`/`DLD_CLIENT_SECRET`)
 * straight from `process.env`, so it must only ever be imported from
 * server-side code (a Server Action, Route Handler, etc.), never from a
 * `"use client"` component. It is currently only imported by
 * `src/app/dashboard/actions.ts`.
 *
 * STUBBED end-to-end, same posture as `refresh-dari-valuation`
 * (`supabase/functions/refresh-dari-valuation/index.ts`): DLD/RERA have no
 * confirmed public API access yet, so every subsystem below falls back to a
 * deterministic mock response (tagged `isMock: true`) whenever
 * `DLD_MOCK_MODE=true` is set or the OAuth client credentials are missing.
 * The request/response contracts are the real, final shape agreed with the
 * rest of the app — only the internal `callDld()` request function needs to
 * change once real API access exists.
 */

export type DldErrorCode =
  | "invalid_request"
  | "invalid_deed_number"
  | "invalid_project_number"
  | "inactive_project"
  | "not_found"
  | "rate_limited"
  | "provider_not_configured"
  | "invalid_response"
  | "timeout"
  | "network_error";

export class DldServiceError extends Error {
  code: DldErrorCode;

  constructor(code: DldErrorCode, message: string) {
    super(message);
    this.name = "DldServiceError";
    this.code = code;
  }
}

type DldResult<T> =
  | ({ ok: true; isMock: boolean } & T)
  | { ok: false; code: DldErrorCode; error: string };

// --- Mock mode --------------------------------------------------------

function isMockMode(): boolean {
  if (process.env.DLD_MOCK_MODE === "true") return true;
  return !process.env.DLD_CLIENT_ID || !process.env.DLD_CLIENT_SECRET;
}

// --- OAuth 2.0 client-credentials grant, with in-memory token caching --

type CachedToken = { accessToken: string; expiresAt: number };

/**
 * Module-level cache — safe for a long-lived Node.js server process (this
 * runs inside Next.js Server Actions, not a stateless per-request Edge
 * Function), but is naturally scoped per server instance/deploy, exactly
 * like any other in-memory cache. A stale token is caught by `callDld()`'s
 * 401 handling below and forces one re-fetch.
 */
let cachedToken: CachedToken | null = null;

const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 30_000;

async function getAccessToken(signal: AbortSignal): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.DLD_CLIENT_ID;
  const clientSecret = process.env.DLD_CLIENT_SECRET;
  const tokenUrl = process.env.DLD_TOKEN_URL;

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new DldServiceError(
      "provider_not_configured",
      "The Dubai Land Department integration is not configured.",
    );
  }

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: process.env.DLD_OAUTH_SCOPE ?? "",
      }),
      signal,
    });
  } catch {
    throw new DldServiceError("network_error", "Could not reach the Dubai Land Department authentication service.");
  }

  if (!response.ok) {
    throw new DldServiceError(
      response.status === 429 ? "rate_limited" : "network_error",
      `Dubai Land Department authentication failed (${response.status}).`,
    );
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token || !json.expires_in) {
    throw new DldServiceError("invalid_response", "Received an unexpected authentication response.");
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// --- Shared request helper ---------------------------------------------

const REQUEST_TIMEOUT_MS = 8_000;

async function callDld<T>(
  path: string,
  body: Record<string, string | number | undefined>,
): Promise<T> {
  const baseUrl = process.env.DLD_API_BASE_URL;
  if (!baseUrl) {
    throw new DldServiceError(
      "provider_not_configured",
      "The Dubai Land Department integration is not configured.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const accessToken = await getAccessToken(controller.signal);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new DldServiceError("timeout", "The Dubai Land Department request timed out.");
      }
      throw new DldServiceError("network_error", "Could not reach the Dubai Land Department service.");
    }

    if (response.status === 404) {
      throw new DldServiceError("not_found", "No matching property was found.");
    }
    if (response.status === 429) {
      throw new DldServiceError("rate_limited", "Too many requests — try again shortly.");
    }
    if (!response.ok) {
      throw new DldServiceError("network_error", `Dubai Land Department request failed (${response.status}).`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function withErrorHandling<T>(fn: () => Promise<T>): Promise<DldResult<T>> {
  try {
    const data = await fn();
    return { ok: true, isMock: false, ...data };
  } catch (err) {
    if (err instanceof DldServiceError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: "network_error", error: "An unexpected error occurred." };
  }
}

// --- Smart Valuation API (ready-built properties) -----------------------

export type SmartValuationRequest = {
  titleDeedNumber: string;
  /** "Municipality Plot ID / Area ID". */
  plotId: string;
};

export type SmartValuationData = {
  ai_valuation_amount: number;
  valuation_date: string;
  certificate_reference: string;
};

export type SmartValuationResult = DldResult<SmartValuationData>;

function mockSmartValuation(request: SmartValuationRequest): SmartValuationData {
  const seed = hashString(request.titleDeedNumber + request.plotId);
  return {
    ai_valuation_amount: 800_000 + (seed % 2_000_000),
    valuation_date: new Date().toISOString().slice(0, 10),
    certificate_reference: `MOCK-SV-${seed.toString(16).toUpperCase()}`,
  };
}

export async function getSmartValuation(
  request: SmartValuationRequest,
): Promise<SmartValuationResult> {
  if (!request.titleDeedNumber || !request.plotId) {
    return {
      ok: false,
      code: "invalid_request",
      error: "A Title Deed Number and Plot/Area ID are required.",
    };
  }

  if (isMockMode()) {
    return { ok: true, isMock: true, ...mockSmartValuation(request) };
  }

  return withErrorHandling(() =>
    callDld<SmartValuationData>("/smart-valuation", {
      title_deed_number: request.titleDeedNumber,
      plot_id: request.plotId,
    }),
  );
}

// --- Oqood & TAS Project Status API (off-plan properties) ---------------

export type OqoodProjectStatusRequest = {
  oqoodContractNumber?: string;
  projectNumber?: string;
  escrowId?: string;
};

export type OqoodProjectStatusData = {
  completion_percentage: number;
  escrow_balance_status: string;
  latest_inspection_date: string;
};

export type OqoodProjectStatusResult = DldResult<OqoodProjectStatusData>;

function mockOqoodProjectStatus(request: OqoodProjectStatusRequest): OqoodProjectStatusData {
  const seed = hashString(
    (request.oqoodContractNumber ?? "") +
      (request.projectNumber ?? "") +
      (request.escrowId ?? ""),
  );
  const statuses = ["Funded", "Under Review", "Released to Developer"];
  return {
    completion_percentage: Math.min(100, seed % 101),
    escrow_balance_status: statuses[seed % statuses.length],
    latest_inspection_date: new Date().toISOString().slice(0, 10),
  };
}

export async function getOqoodProjectStatus(
  request: OqoodProjectStatusRequest,
): Promise<OqoodProjectStatusResult> {
  if (!request.oqoodContractNumber && !request.projectNumber && !request.escrowId) {
    return {
      ok: false,
      code: "invalid_request",
      error: "An Oqood Contract Number, Project Number, or Escrow ID is required.",
    };
  }

  if (isMockMode()) {
    return { ok: true, isMock: true, ...mockOqoodProjectStatus(request) };
  }

  return withErrorHandling(() =>
    callDld<OqoodProjectStatusData>("/oqood-tas/project-status", {
      oqood_contract_number: request.oqoodContractNumber,
      project_number: request.projectNumber,
      escrow_id: request.escrowId,
    }),
  );
}

// --- Ejari Rental Index API (rental benchmark, either property type) ----

export type EjariRentalIndexRequest = {
  propertyType: string;
  /** "Area / Community ID". */
  communityId: string;
  bedroomCount: number;
};

export type EjariRentalIndexData = {
  index_rental_range: { min: number; max: number };
  max_permissible_increase: number;
};

export type EjariRentalIndexResult = DldResult<EjariRentalIndexData>;

function mockEjariRentalIndex(request: EjariRentalIndexRequest): EjariRentalIndexData {
  const seed = hashString(request.propertyType + request.communityId + request.bedroomCount);
  const base = 40_000 + (seed % 60_000) + request.bedroomCount * 15_000;
  return {
    index_rental_range: { min: base, max: Math.round(base * 1.15) },
    max_permissible_increase: [0, 5, 10, 15, 20][seed % 5],
  };
}

export async function getEjariRentalIndex(
  request: EjariRentalIndexRequest,
): Promise<EjariRentalIndexResult> {
  if (!request.propertyType || !request.communityId) {
    return {
      ok: false,
      code: "invalid_request",
      error: "A Property Type and Area/Community ID are required.",
    };
  }

  if (isMockMode()) {
    return { ok: true, isMock: true, ...mockEjariRentalIndex(request) };
  }

  return withErrorHandling(() =>
    callDld<EjariRentalIndexData>("/ejari/rental-index", {
      property_type: request.propertyType,
      community_id: request.communityId,
      bedroom_count: request.bedroomCount,
    }),
  );
}

// --- Small deterministic hash for mock data (no external dependency) ----

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}
