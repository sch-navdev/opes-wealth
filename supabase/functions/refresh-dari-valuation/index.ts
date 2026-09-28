// Supabase Edge Function: refresh-dari-valuation
//
// Fetches a live real estate valuation from ADREC/DARI for one property.
//
// STUBBED, on purpose: ADREC (Abu Dhabi Real Estate Centre) / DARI does not
// currently have a confirmed public developer API -- endpoint URL, auth
// model, and terms of use are all unconfirmed (see the "Honesty check" in
// `tracker/Market-Data-Integration.md`). Rather than invent a real-looking
// call to an endpoint that may not exist, `fetchFromProvider` below returns
// a clearly-marked mock valuation (`isMock: true`). Everything around it --
// request validation, the timeout/error-shape contract, and the response
// envelope -- is real and meant to be kept as-is once real endpoint details
// are confirmed with the provider; only `fetchFromProvider`'s body would
// need to change to a real `fetch(...)`.

interface ValuationRequest {
  assetId: string;
  address?: string;
  propertyType?: string;
  surfaceArea?: number;
}

interface ValuationSuccess {
  value: number;
  asOf: string;
  isMock: true;
  source: "dari";
}

type ValuationErrorCode =
  | "invalid_request"
  | "timeout"
  | "rate_limited"
  | "invalid_response"
  | "network_error";

interface ValuationError {
  error: { code: ValuationErrorCode; message: string };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ADREC/DARI's real timeout/rate-limit behavior is unknown (see file
// header) -- 8s is a conservative placeholder for "the client should stop
// waiting and show an error" rather than a figure from the provider's docs.
const REQUEST_TIMEOUT_MS = 8000;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/**
 * STUBBED provider call -- see file header. Swap this body for the real
 * `fetch(DARI_ENDPOINT, ...)` once ADREC/DARI API access is confirmed,
 * keeping the same signature (accepts the abort signal, resolves to
 * `ValuationSuccess`, throws on failure) so the error handling in the
 * request handler below doesn't need to change.
 */
async function fetchFromProvider(
  request: ValuationRequest,
  signal: AbortSignal,
): Promise<ValuationSuccess> {
  // Simulates network latency so the client's loading state is exercised
  // by something other than an instant resolve.
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // Deterministic placeholder figure derived from the property's surface
  // area when available -- NOT a real market valuation, never treat it as
  // one. A missing/zero surface area falls back to a flat placeholder.
  const basis =
    request.surfaceArea && request.surfaceArea > 0
      ? request.surfaceArea * 12000
      : 500000;

  return {
    value: Math.round(basis),
    asOf: new Date().toISOString(),
    isMock: true,
    source: "dari",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      {
        error: { code: "invalid_request", message: "Only POST is supported." },
      } satisfies ValuationError,
      405,
    );
  }

  let body: ValuationRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(
      {
        error: {
          code: "invalid_request",
          message: "Request body must be valid JSON.",
        },
      } satisfies ValuationError,
      400,
    );
  }

  if (!body.assetId || typeof body.assetId !== "string") {
    return jsonResponse(
      {
        error: { code: "invalid_request", message: "assetId is required." },
      } satisfies ValuationError,
      400,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const result = await fetchFromProvider(body, controller.signal);
    clearTimeout(timeout);
    return jsonResponse(result, 200);
  } catch (err) {
    clearTimeout(timeout);

    if (err instanceof DOMException && err.name === "AbortError") {
      return jsonResponse(
        {
          error: {
            code: "timeout",
            message: "The valuation provider took too long to respond.",
          },
        } satisfies ValuationError,
        504,
      );
    }

    // Real integration: branch on the provider's actual failure shape here
    // (HTTP 429 -> "rate_limited", a malformed body -> "invalid_response",
    // etc). The stub above never reaches this branch itself.
    return jsonResponse(
      {
        error: {
          code: "network_error",
          message: "Could not reach the valuation provider.",
        },
      } satisfies ValuationError,
      502,
    );
  }
});
