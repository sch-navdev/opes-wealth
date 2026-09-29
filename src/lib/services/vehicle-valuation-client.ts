/**
 * French vehicle valuation integration client.
 *
 * Server-only module — reads real secrets straight from `process.env`, so it
 * must only ever be imported from server-side code (a Server Action, Route
 * Handler, etc.), never from a `"use client"` component. It is currently only
 * imported by `src/app/dashboard/actions.ts`.
 *
 * The official French "Cote Argus" valuation index is strictly closed B2B
 * (no public/partner API a small app can get access to), so this client is
 * architected against the shape of a B2B valuation aggregator instead — API
 * providers such as La Centrale or Autobiz both expose a "estimate by
 * plate/VIN + mileage" endpoint returning a market value and a depreciation
 * signal. STUBBED end-to-end, same posture as `dld-client.ts`/`adrec-client.ts`:
 * every call falls back to a deterministic mock response (tagged
 * `isMock: true`) whenever `VEHICLE_VALUATION_MOCK_MODE=true` is set or the
 * OAuth client credentials are missing. The request/response contract is the
 * real, final shape agreed with the rest of the app — only the internal
 * `callVehicleValuationApi()` request function needs to change once real API
 * access exists (to either provider — both would slot into the same shape).
 */

export type VehicleValuationErrorCode =
  | "invalid_request"
  | "invalid_identifier"
  | "not_found"
  | "rate_limited"
  | "provider_not_configured"
  | "invalid_response"
  | "timeout"
  | "network_error"
  | "under_development";

export class VehicleValuationServiceError extends Error {
  code: VehicleValuationErrorCode;

  constructor(code: VehicleValuationErrorCode, message: string) {
    super(message);
    this.name = "VehicleValuationServiceError";
    this.code = code;
  }
}

type VehicleValuationResult<T> =
  | ({ ok: true; isMock: boolean } & T)
  | { ok: false; code: VehicleValuationErrorCode; error: string };

// --- Mock mode --------------------------------------------------------

function isMockMode(): boolean {
  if (process.env.VEHICLE_VALUATION_MOCK_MODE === "true") return true;
  return (
    !process.env.VEHICLE_VALUATION_CLIENT_ID ||
    !process.env.VEHICLE_VALUATION_CLIENT_SECRET
  );
}

// --- OAuth 2.0 client-credentials grant, with in-memory token caching --

type CachedToken = { accessToken: string; expiresAt: number };

/**
 * Module-level cache — safe for a long-lived Node.js server process, scoped
 * per server instance/deploy like any other in-memory cache. A stale token is
 * caught by `callVehicleValuationApi()`'s error handling below and forces one
 * re-fetch.
 */
let cachedToken: CachedToken | null = null;

const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 30_000;

async function getAccessToken(signal: AbortSignal): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS > Date.now()) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.VEHICLE_VALUATION_CLIENT_ID;
  const clientSecret = process.env.VEHICLE_VALUATION_CLIENT_SECRET;
  const tokenUrl = process.env.VEHICLE_VALUATION_TOKEN_URL;

  if (!clientId || !clientSecret || !tokenUrl) {
    throw new VehicleValuationServiceError(
      "provider_not_configured",
      "The vehicle valuation integration is not configured.",
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
        scope: process.env.VEHICLE_VALUATION_OAUTH_SCOPE ?? "",
      }),
      signal,
    });
  } catch {
    throw new VehicleValuationServiceError(
      "network_error",
      "Could not reach the vehicle valuation authentication service.",
    );
  }

  if (!response.ok) {
    throw new VehicleValuationServiceError(
      response.status === 429 ? "rate_limited" : "network_error",
      `Vehicle valuation authentication failed (${response.status}).`,
    );
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token || !json.expires_in) {
    throw new VehicleValuationServiceError(
      "invalid_response",
      "Received an unexpected authentication response.",
    );
  }

  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

// --- Shared request helper ---------------------------------------------

const REQUEST_TIMEOUT_MS = 8_000;

async function callVehicleValuationApi<T>(
  path: string,
  body: Record<string, string | number | undefined>,
): Promise<T> {
  const baseUrl = process.env.VEHICLE_VALUATION_API_BASE_URL;
  if (!baseUrl) {
    throw new VehicleValuationServiceError(
      "provider_not_configured",
      "The vehicle valuation integration is not configured.",
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
        throw new VehicleValuationServiceError("timeout", "The vehicle valuation request timed out.");
      }
      throw new VehicleValuationServiceError("network_error", "Could not reach the vehicle valuation service.");
    }

    if (response.status === 404) {
      throw new VehicleValuationServiceError("not_found", "No matching vehicle was found.");
    }
    if (response.status === 429) {
      throw new VehicleValuationServiceError("rate_limited", "Too many requests — try again shortly.");
    }
    if (!response.ok) {
      throw new VehicleValuationServiceError(
        "network_error",
        `Vehicle valuation request failed (${response.status}).`,
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function withErrorHandling<T>(
  fn: () => Promise<T>,
): Promise<VehicleValuationResult<T>> {
  try {
    const data = await fn();
    return { ok: true, isMock: false, ...data };
  } catch (err) {
    if (err instanceof VehicleValuationServiceError) {
      return { ok: false, code: err.code, error: err.message };
    }
    return { ok: false, code: "network_error", error: "An unexpected error occurred." };
  }
}

// --- Vehicle valuation (La Centrale / Autobiz-shaped) -------------------

export type VehicleValuationRequest = {
  licensePlate?: string;
  vin?: string;
  /** Current odometer reading in kilometers — required by both providers to adjust for wear. */
  mileage: number;
};

export type VehicleValuationData = {
  market_valuation_amount: number;
  /** A qualitative read on how fast the vehicle is losing value, as reported by the provider (neither La Centrale nor Autobiz expose a precise numeric rate for this in their public documentation). */
  depreciation_trend: "accelerating" | "stable" | "slowing";
  valuation_date: string;
  provider: "la_centrale" | "autobiz";
};

export type VehicleValuationResultType = VehicleValuationResult<VehicleValuationData>;

function mockVehicleValuation(request: VehicleValuationRequest): VehicleValuationData {
  const seed = hashString((request.licensePlate ?? "") + (request.vin ?? "") + request.mileage);
  const trends: VehicleValuationData["depreciation_trend"][] = ["accelerating", "stable", "slowing"];
  const mileageDiscount = Math.min(0.6, request.mileage / 300_000);
  const baseValue = 8_000 + (seed % 60_000);
  return {
    market_valuation_amount: Math.round(baseValue * (1 - mileageDiscount)),
    depreciation_trend: trends[seed % trends.length],
    valuation_date: new Date().toISOString().slice(0, 10),
    provider: seed % 2 === 0 ? "la_centrale" : "autobiz",
  };
}

export async function getVehicleValuation(
  request: VehicleValuationRequest,
): Promise<VehicleValuationResultType> {
  if (!request.licensePlate && !request.vin) {
    return {
      ok: false,
      code: "invalid_request",
      error: "A License Plate or VIN is required.",
    };
  }
  if (!Number.isFinite(request.mileage) || request.mileage < 0) {
    return {
      ok: false,
      code: "invalid_request",
      error: "A valid current mileage is required.",
    };
  }

  if (isMockMode()) {
    return { ok: true, isMock: true, ...mockVehicleValuation(request) };
  }

  return withErrorHandling(() =>
    callVehicleValuationApi<VehicleValuationData>("/valuation", {
      license_plate: request.licensePlate,
      vin: request.vin,
      mileage: request.mileage,
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
