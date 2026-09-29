/**
 * Abu Dhabi Real Estate Centre (ADREC) / DARI integration client.
 *
 * Server-only module, same architecture as `dld-client.ts` (Dubai Land
 * Department) — reads real secrets (`ADREC_CLIENT_ID`/`ADREC_CLIENT_SECRET`)
 * straight from `process.env`, so it must only ever be imported from
 * server-side code (a Server Action, Route Handler, etc.), never from a
 * `"use client"` component. It is currently only imported by
 * `src/app/dashboard/actions.ts`.
 *
 * This module supersedes the earlier `refresh-dari-valuation` Edge
 * Function / `src/lib/market-data/dari.ts` client-lib stub — that pipeline
 * is still deployed (see `tracker/Market-Data-Integration.md`) but is no
 * longer called from the app; this module is now the single "DARI" entry
 * point, unified with ADREC under one client, per this task's request.
 *
 * STUBBED end-to-end, same posture as `dld-client.ts` and the
 * `refresh-dari-valuation` Edge Function it replaces: ADREC/DARI have no
 * confirmed public API access yet, so every subsystem below falls back to
 * a deterministic mock response (tagged `isMock: true`) whenever
 * `ADREC_MOCK_MODE=true` is set or the OAuth client credentials are
 * missing. The request/response contracts are the real, final shape
 * agreed with the rest of the app — only the internal `callAdrec()`
 * request function needs to change once real API access exists.
 */

export type AdrecErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_PLOT_NUMBER"
  | "INVALID_TITLE_DEED"
  | "PROJECT_NOT_FOUND"
  | "DEVELOPER_BLOCKED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "PROVIDER_NOT_CONFIGURED"
  | "INVALID_RESPONSE"
  | "TIMEOUT"
  | "NETWORK_ERROR";

export class AdrecServiceError extends Error {
  code: AdrecErrorCode;

  constructor(code: AdrecErrorCode, message: string) {
    super(message);
    this.name = "AdrecServiceError";
    this.code = code;
  }
}

type AdrecResult<T> =
  | ({ ok: true; isMock: boolean } & T)
  | { ok: false; code: AdrecErrorCode; error: string };

// --- Mock mode --------------------------------------------------------

function isMockMode(): boolean {
  if (process.env.ADREC_MOCK_MODE === "true") return true;
  return !process.env.ADREC_CLIENT_ID || !process.env.ADREC_CLIENT_SECRET;
}

// --- OAuth 2.0 client-credentials grant, with in-memory token caching --

type CachedToken = { accessToken: string; expiresAt: number };

/**
 * Module-level cache, same rationale as `dld-client.ts`'s: safe for a
 * long-lived Node.js server process (Next.js Server Actions), scoped per
 * server instance/deploy like any other in-memory cache.
 */
let cachedToken: CachedToken | null = null;

const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 30_000;

async function getAccessToken(signal: AbortSignal): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.ADREC_CLIENT_ID;
  const clientSecret = process.env.ADREC_CLIENT_SECRET;
  const tokenUrl = process.env.ADREC_TOKEN_URL;

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new AdrecServiceError(
      "PROVIDER_NOT_CONFIGURED",
      "The ADREC/DARI integration is not configured.",
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
        scope: process.env.ADREC_OAUTH_SCOPE ?? "",
      }),
      signal,
    });
  } catch {
    throw new AdrecServiceError("NETWORK_ERROR", "Could not reach the ADREC authentication service.");
  }

  if (!response.ok) {
    throw new AdrecServiceError(
      response.status === 429 ? "RATE_LIMITED" : "NETWORK_ERROR",
      `ADREC authentication failed (${response.status}).`,
    );
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token || !json.expires_in) {
    throw new AdrecServiceError("INVALID_RESPONSE", "Received an unexpected authentication response.");
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// --- Shared request helper ---------------------------------------------

const REQUEST_TIMEOUT_MS = 8_000;

async function callAdrec<T>(
  path: string,
  body: Record<string, string | number | undefined>,
): Promise<T> {
  const baseUrl = process.env.ADREC_API_BASE_URL;
  if (!baseUrl) {
    throw new AdrecServiceError(
      "PROVIDER_NOT_CONFIGURED",
      "The ADREC/DARI integration is not configured.",
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
        throw new AdrecServiceError("TIMEOUT", "The ADREC request timed out.");
      }
      throw new AdrecServiceError("NETWORK_ERROR", "Could not reach the ADREC service.");
    }

    if (response.status === 404) {
      throw new AdrecServiceError("NOT_FOUND", "No matching property was found.");
    }
    if (response.status === 429) {
      throw new AdrecServiceError("RATE_LIMITED", "Too many requests — try again shortly.");
    }
    if (!response.ok) {
      throw new AdrecServiceError("NETWORK_ERROR", `ADREC request failed (${response.status}).`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function withErrorHandling<T>(fn: () => Promise<T>): Promise<AdrecResult<T>> {
  try {
    const data = await fn();
    return { ok: true, isMock: false, ...data };
  } catch (err) {
    if (err instanceof AdrecServiceError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: "NETWORK_ERROR", error: "An unexpected error occurred." };
  }
}

// --- Ready-Built Valuation — DARI Certificates API -----------------------

export type ReadyBuiltValuationRequest = {
  plotNumber: string;
  unitId: string;
  titleDeedNumber: string;
};

export type ReadyBuiltValuationData = {
  officialValuationAmount: number;
  certificateId: string;
  valuationDate: string;
};

export type ReadyBuiltValuationResult = AdrecResult<ReadyBuiltValuationData>;

function mockReadyBuiltValuation(request: ReadyBuiltValuationRequest): ReadyBuiltValuationData {
  const seed = hashString(request.plotNumber + request.unitId + request.titleDeedNumber);
  return {
    officialValuationAmount: 750_000 + (seed % 2_500_000),
    certificateId: `MOCK-DARI-${seed.toString(16).toUpperCase()}`,
    valuationDate: new Date().toISOString().slice(0, 10),
  };
}

export async function getReadyBuiltValuation(
  request: ReadyBuiltValuationRequest,
): Promise<ReadyBuiltValuationResult> {
  if (!request.plotNumber || !request.unitId || !request.titleDeedNumber) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      error: "A Plot Number, Unit ID, and Title Deed Number are required.",
    };
  }

  if (isMockMode()) {
    return { ok: true, isMock: true, ...mockReadyBuiltValuation(request) };
  }

  return withErrorHandling(() =>
    callAdrec<ReadyBuiltValuationData>("/dari/certificates/valuation", {
      plot_number: request.plotNumber,
      unit_id: request.unitId,
      title_deed_number: request.titleDeedNumber,
    }),
  );
}

// --- Off-Plan Project Tracking — ADREC Projects & Escrow API -------------

export type OffPlanProjectTrackingRequest = {
  projectId: string;
  developerId: string;
};

export type OffPlanProjectTrackingData = {
  projectCompletionRate: number;
  escrowStatus: string;
  constructionStage: string;
  latestInspectionDate: string;
};

export type OffPlanProjectTrackingResult = AdrecResult<OffPlanProjectTrackingData>;

function mockOffPlanProjectTracking(
  request: OffPlanProjectTrackingRequest,
): OffPlanProjectTrackingData {
  const seed = hashString(request.projectId + request.developerId);
  const stages = ["Foundation", "Structure", "Finishing", "Handover Preparation"];
  const statuses = ["Funded", "Under Review", "Released to Developer"];
  return {
    projectCompletionRate: Math.min(100, seed % 101),
    escrowStatus: statuses[seed % statuses.length],
    constructionStage: stages[seed % stages.length],
    latestInspectionDate: new Date().toISOString().slice(0, 10),
  };
}

export async function getOffPlanProjectTracking(
  request: OffPlanProjectTrackingRequest,
): Promise<OffPlanProjectTrackingResult> {
  if (!request.projectId || !request.developerId) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      error: "A Project ID and Developer ID are required.",
    };
  }

  if (isMockMode()) {
    return { ok: true, isMock: true, ...mockOffPlanProjectTracking(request) };
  }

  return withErrorHandling(() =>
    callAdrec<OffPlanProjectTrackingData>("/adrec/projects/escrow-status", {
      project_id: request.projectId,
      developer_id: request.developerId,
    }),
  );
}

// --- Rental Tracking — DARI Leasing API ----------------------------------

export type RentalTrackingRequest = {
  contractId: string;
  municipalityNumber: string;
};

export type RentalTrackingData = {
  activeLeaseStatus: string;
  registeredAnnualRent: number;
};

export type RentalTrackingResult = AdrecResult<RentalTrackingData>;

function mockRentalTracking(request: RentalTrackingRequest): RentalTrackingData {
  const seed = hashString(request.contractId + request.municipalityNumber);
  const statuses = ["Active", "Expired", "Pending Registration"];
  return {
    activeLeaseStatus: statuses[seed % statuses.length],
    registeredAnnualRent: 40_000 + (seed % 160_000),
  };
}

export async function getRentalTracking(
  request: RentalTrackingRequest,
): Promise<RentalTrackingResult> {
  if (!request.contractId || !request.municipalityNumber) {
    return {
      ok: false,
      code: "INVALID_REQUEST",
      error: "A Contract ID and Municipality Number are required.",
    };
  }

  if (isMockMode()) {
    return { ok: true, isMock: true, ...mockRentalTracking(request) };
  }

  return withErrorHandling(() =>
    callAdrec<RentalTrackingData>("/dari/leasing/status", {
      contract_id: request.contractId,
      municipality_number: request.municipalityNumber,
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
