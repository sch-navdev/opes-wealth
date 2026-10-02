/**
 * Where a request really comes from (pure helpers, no I/O). On Vercel the edge adds
 * `x-vercel-ip-country` (ISO code), `x-vercel-ip-city` (URL-encoded) and
 * `x-vercel-ip-country-region`; the client address is the first `x-forwarded-for`
 * entry. None of these exist on a local dev server, so every field can be null.
 */
export type RequestGeo = {
  ip: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  userAgent: string | null;
};

function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).trim() || null;
  } catch {
    return value.trim() || null;
  }
}

export function readRequestGeo(h: Headers): RequestGeo {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const country = h.get("x-vercel-ip-country")?.trim().toUpperCase() ?? null;
  return {
    ip: forwarded || h.get("x-real-ip")?.trim() || null,
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    city: decode(h.get("x-vercel-ip-city")),
    region: decode(h.get("x-vercel-ip-country-region")),
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  };
}

/** The `session_id` claim of an access token (no signature check: the caller has just verified the user). */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof payload.session_id === "string" && /^[0-9a-f-]{36}$/i.test(payload.session_id) ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** "Dubai, United Arab Emirates" in the viewer's language; null when neither is known. */
export function formatLocation(city: string | null, countryCode: string | null, locale: string): string | null {
  let country: string | null = null;
  if (countryCode) {
    try {
      country = new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ?? countryCode;
    } catch {
      country = countryCode;
    }
  }
  return [city, country].filter(Boolean).join(", ") || null;
}
