// Supabase Edge Function: adrec-pricing
//
// Retrieves an official ready-built valuation for an Abu Dhabi property from
// the ADREC / DARI Certificates API and returns it already mapped onto the
// app's existing `RealEstateMetadata` shape (`src/lib/real-estate.ts`) --
// specifically `market_valuation`. Nothing is persisted here and no new
// columns/tables are involved; the caller decides what to do with it.
//
// MOCK_MODE service-client pattern (same as `src/lib/services/*-client.ts`):
// if `MOCK_MODE=true` or the ADREC OAuth credentials aren't set as function
// secrets, a deterministic mock payload tagged `isMock: true` is returned
// instead of calling the provider. ADREC has no confirmed public API access
// yet, so the real-call path below follows the contract already used by
// `adrec-client.ts`'s `callAdrec()` and is unverified against a live API.
//
//   supabase secrets set ADREC_CLIENT_ID=... ADREC_CLIENT_SECRET=... \
//     ADREC_TOKEN_URL=... ADREC_API_BASE_URL=... [ADREC_OAUTH_SCOPE=...]
//
// Response is always HTTP 200 with `{ ok: true, isMock, data }` or
// `{ ok: false, code, error }` so the client never has to parse a non-2xx
// body; transport-level failures are the only non-200s.

interface PricingRequest {
  plotNumber?: string;
  unitId?: string;
  titleDeedNumber?: string;
}

/** Fields of `RealEstateMetadata` this function can populate, plus certificate provenance. */
interface PricingData {
  market_valuation: number;
  valuation_date: string;
  certificate_id: string;
}

type PricingErrorCode =
  | "invalid_request"
  | "not_found"
  | "rate_limited"
  | "provider_not_configured"
  | "invalid_response"
  | "timeout"
  | "network_error";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REQUEST_TIMEOUT_MS = 8000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function fail(code: PricingErrorCode, error: string): Response {
  return json({ ok: false, code, error });
}

function isMockMode(): boolean {
  if (Deno.env.get("MOCK_MODE") === "true") return true;
  return !Deno.env.get("ADREC_CLIENT_ID") || !Deno.env.get("ADREC_CLIENT_SECRET");
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mockData(req: Required<PricingRequest>): PricingData {
  const seed = hashString(req.plotNumber + req.unitId + req.titleDeedNumber);
  return {
    market_valuation: 750_000 + (seed % 2_500_000),
    valuation_date: new Date().toISOString().slice(0, 10),
    certificate_id: `MOCK-DARI-${seed.toString(16).toUpperCase()}`,
  };
}

class ProviderError extends Error {
  constructor(public code: PricingErrorCode, message: string) {
    super(message);
  }
}

async function timedFetch(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ProviderError("timeout", "The ADREC request timed out.");
    }
    throw new ProviderError("network_error", "Could not reach the ADREC service.");
  }
}

async function getAccessToken(signal: AbortSignal): Promise<string> {
  const clientId = Deno.env.get("ADREC_CLIENT_ID");
  const clientSecret = Deno.env.get("ADREC_CLIENT_SECRET");
  const tokenUrl = Deno.env.get("ADREC_TOKEN_URL");
  if (!clientId || !clientSecret || !tokenUrl) {
    throw new ProviderError("provider_not_configured", "The ADREC integration is not configured.");
  }

  const res = await timedFetch(
    tokenUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: Deno.env.get("ADREC_OAUTH_SCOPE") ?? "",
      }),
    },
    signal,
  );

  if (res.status === 429) throw new ProviderError("rate_limited", "ADREC rate limit hit.");
  if (!res.ok) {
    throw new ProviderError("network_error", `ADREC authentication failed (${res.status}).`);
  }
  const body = await res.json().catch(() => null);
  if (!body?.access_token) {
    throw new ProviderError("invalid_response", "Unexpected ADREC authentication response.");
  }
  return body.access_token as string;
}

async function fetchRealValuation(req: Required<PricingRequest>): Promise<PricingData> {
  const baseUrl = Deno.env.get("ADREC_API_BASE_URL");
  if (!baseUrl) {
    throw new ProviderError("provider_not_configured", "The ADREC integration is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const token = await getAccessToken(controller.signal);
    const res = await timedFetch(
      `${baseUrl}/dari/certificates/valuation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          plot_number: req.plotNumber,
          unit_id: req.unitId,
          title_deed_number: req.titleDeedNumber,
        }),
      },
      controller.signal,
    );

    if (res.status === 404) throw new ProviderError("not_found", "No matching property was found.");
    if (res.status === 429) throw new ProviderError("rate_limited", "Too many requests.");
    if (!res.ok) throw new ProviderError("network_error", `ADREC request failed (${res.status}).`);

    const body = await res.json().catch(() => null);
    if (
      typeof body?.officialValuationAmount !== "number" ||
      typeof body?.certificateId !== "string" ||
      typeof body?.valuationDate !== "string"
    ) {
      throw new ProviderError("invalid_response", "Unexpected ADREC valuation response.");
    }
    return {
      market_valuation: body.officialValuationAmount,
      valuation_date: body.valuationDate,
      certificate_id: body.certificateId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, code: "invalid_request", error: "POST only." }, 405);

  let body: PricingRequest;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_request", "Request body must be JSON.");
  }

  const { plotNumber, unitId, titleDeedNumber } = body;
  if (!plotNumber || !unitId || !titleDeedNumber) {
    return fail("invalid_request", "A Plot Number, Unit ID, and Title Deed Number are required.");
  }
  const request = { plotNumber, unitId, titleDeedNumber };

  if (isMockMode()) {
    return json({ ok: true, isMock: true, data: mockData(request) });
  }

  try {
    return json({ ok: true, isMock: false, data: await fetchRealValuation(request) });
  } catch (err) {
    if (err instanceof ProviderError) return fail(err.code, err.message);
    return fail("network_error", "An unexpected error occurred.");
  }
});
