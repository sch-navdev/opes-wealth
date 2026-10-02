import { NextResponse } from "next/server";
import { getBank } from "@/lib/banking/institutions";
import { BROKER_REGISTRY, type BrokerId } from "@/lib/parsers/broker-registry";
import { getDirectoryBroker } from "@/lib/brokers/directory";

/**
 * Same-origin logo proxy for banks and brokers. The browser asks for a registry
 * KEY (never a free-form URL), the server maps it to a domain from our own
 * registries and fetches that site's icon from Google's favicon service — so
 * this can't be used as an open proxy, the CSP can stay tight, and a missing
 * icon is a plain 404 that the UI turns into an initials avatar.
 *
 * (Clearbit's logo API has been shut down and Simple Icons doesn't carry these
 * banks, so a favicon is the most reliable "brand mark" source available. It is
 * the institution's site icon, not a guaranteed official logo file.)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; key: string }> },
) {
  const { kind, key } = await params;

  let domain: string | undefined;
  if (kind === "bank") domain = getBank(key)?.domain;
  else if (kind === "broker") {
    domain = BROKER_REGISTRY[key as BrokerId]?.domain ?? getDirectoryBroker(key)?.domain;
  }
  if (!domain) return new NextResponse(null, { status: 404 });

  const upstream = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128&url=${encodeURIComponent(`https://${domain}`)}`;
  try {
    const res = await fetch(upstream, { next: { revalidate: 60 * 60 * 24 * 7 } });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return new NextResponse(null, { status: 404 });
    return new NextResponse(await res.arrayBuffer(), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
