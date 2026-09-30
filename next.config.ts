import type { NextConfig } from "next";

// Lightweight env check (no central env schema in this project): auth email
// redirects and passkey/auth domain setup depend on the canonical site URL,
// so flag it loudly at build/server start rather than failing silently later.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL) {
  console.warn(
    "[env] NEXT_PUBLIC_SITE_URL is not set. Set it in the Vercel dashboard — Supabase Auth email redirects (and domain-bound passkey validation) depend on it. See tracker/Deployment.md.",
  );
}

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
