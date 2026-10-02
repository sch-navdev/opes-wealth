import type { NextConfig } from "next";

// Lightweight env check (no central env schema in this project): auth email
// redirects and passkey/auth domain setup depend on the canonical site URL,
// so flag it loudly at build/server start rather than failing silently later.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL) {
  console.warn(
    "[env] NEXT_PUBLIC_SITE_URL is not set. Set it in the Vercel dashboard — Supabase Auth email redirects (and domain-bound passkey validation) depend on it. See tracker/Deployment.md.",
  );
}

// Asset photos are served from Supabase Storage (public bucket `asset-photos`).
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig: NextConfig = {
  // pdf-parse (pdf.js 1.x) breaks when bundled ("bad XRef entry" on valid PDFs): load it from node_modules at runtime.
  serverExternalPackages: ["pdf-parse"],
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/asset-photos/**" }]
      : [],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
