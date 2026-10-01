[[PROJECT_TRACKER|← Project Tracker]]

# Deployment

**Status:** Pre-deployment hardening complete — Phase 1, Step 10. The actual Vercel deployment has **not** happened yet; this session did the local-only groundwork for it, not the deployment itself.

Scope: deploy to Vercel. `.env.local` currently holds the Supabase URL/anon key locally (gitignored) — production env vars, the Supabase project's production credentials, and any still-unapplied migrations under `supabase/migrations/` (see [[Database-Schema|Database Schema]]) all need to be sorted before/at this step.

## Pre-deployment hardening (this session)
- **`tsc --noEmit` and `eslint .` are now both fully clean** — zero errors, zero warnings, across the whole project (previously: four known lint failures in `carousel.tsx`/`language-context.tsx`/`privacy-context.tsx`/`mfa.ts`, plus two more `next lint` turned up in the same pass — `setup-2fa-form.tsx` and `theme-toggle.tsx` — and two pre-existing warnings, all now resolved):
  - `mfa.ts` — a real fix: the `any`-typed callback parameter was unnecessary (TS already infers it from context); the follow-on `currentAuthenticationMethods` type error this exposed was fixed by handling its `string | AMREntry` union explicitly, matching the pattern already used a few lines below for `amr`.
  - `language-context.tsx` / `privacy-context.tsx` — real fixes: both rewritten from `useState` + a mount-time `useEffect` reading `localStorage` to `useSyncExternalStore`, which is the textbook-correct primitive for syncing React state with an external, mutable source (no SSR/hydration behavior change — same default-then-sync-after-mount shape as before, just without a synchronous `setState` call inside an effect body).
  - `theme-toggle.tsx` — same real fix: the `mounted` hydration-safety flag (next-themes' own documented pattern) rewritten via `useSyncExternalStore` with a snapshot that's always `false` on the server and `true` on the client — eliminates the extra effect-driven render entirely rather than just silencing the warning.
  - `carousel.tsx` (vendored shadcn/embla primitive) — a scoped, justified `eslint-disable` instead of a rewrite: the flagged line is embla-carousel-react's own documented integration pattern (syncing from an imperative third-party API via `api.on(...)`), and hand-rewriting vendored/third-party-authored code via `useSyncExternalStore` for a lint-only concern was judged not worth the regression risk to the working image-carousel feature.
  - `setup-2fa-form.tsx` — a scoped, justified `eslint-disable`: `isFactorsLoading` already defaults to `true`, so the flagged `setIsFactorsLoading(true)` inside the mount effect's `loadActiveFactors()` call is a same-value no-op there (React bails out of re-rendering) — the linter just can't prove that statically, since the same function is also called from event handlers elsewhere where a fresh `true` is meaningful. Left the MFA setup flow's logic completely untouched given its security sensitivity.
  - `login-form.tsx` — a scoped, justified `eslint-disable`: `window.location.href` (not `router.push()`) after passkey sign-in is deliberate, not an oversight — that path sets the session cookie client-side with no server `redirect()` involved, so a hard reload is needed to guarantee the dashboard's server components read the fresh cookie rather than racing Next's RSC cache. Left this auth-critical path's behavior unchanged.
  - `asset-detail-view.tsx`'s image-carousel `<img>` warning — a real fix, not a suppression: swapped for `next/image` with `fill` + `unoptimized` (the images are already client-resized base64 data URIs from `resizeImageToBase64`, so there's no remote asset for the optimizer to fetch/transform — `unoptimized` just skips that no-op work while still getting `next/image`'s layout-shift handling).
  - Verified all four touched interactive behaviors live in-browser after the fixes: language toggle (EN⇄FR), theme toggle (dark⇄light), privacy-mask toggle, and the asset-detail image carousel (opened a real multi-image dialog, confirmed it renders and paginates) — no regressions, no new console errors beyond the browser pane's own benign HMR-websocket noise.
- **`npm run build` (production build, Turbopack) succeeds with zero errors** — all 11 routes compile, typecheck, and generate cleanly (`/`, `/login`, `/login/mfa`, `/dashboard`, `/dashboard/assets/[id]`, `/dashboard/settings`, `/dashboard/mfa`, `/reset-password`, `/auth/callback`, plus `/_not-found` and the root proxy/middleware).

## What's still actually needed before/at deployment (not done this session)
- **The Vercel deployment itself.** Nothing was pushed or deployed to Vercel this session — no deploy credentials/access were used, and doing so is a shared-infrastructure action that needs Steve's explicit go-ahead regardless of tooling.
- **`NEXT_PUBLIC_SITE_URL`** must be set manually in the Vercel dashboard before the first production deploy — flagged repeatedly since the auth-email-links work (see [[Authentication-Security|Authentication & Security]]); `src/app/auth/actions.ts`'s `getSiteURL()` falls back to the real production domain when this is unset and `VERCEL_URL` is present, but setting it explicitly is still the intended final state.
- ~~**`FINNHUB_API_KEY`** Supabase secret~~ — **Complete (2026-09-30)**: set via the Supabase CLI (now installed and linked to the project); `refresh-market-price` (v5) and `adrec-pricing` (v2) are deployed and ACTIVE. See [[Live-Pricing|Live Pricing]] and [[Market-Data-Integration|Market Data Integration]].
- Production Supabase credentials/env vars in Vercel, and confirming every migration under `supabase/migrations/` (through `0010`) is applied to whichever Supabase project the production deployment points at.

## Environment Hardening: `NEXT_PUBLIC_SITE_URL` (2026-09-30)

- **Must be set manually in the Vercel dashboard** (Project Settings → Environment Variables, Production) to the canonical domain — `https://www.opeswealth.app`. It is **critical for Supabase Auth redirects**: `getSiteURL()` in `src/app/auth/actions.ts` builds the sign-up confirmation and password-reset links from it. It should also match the domain the app's passkeys are registered under (WebAuthn credentials are bound to the domain; a mismatched site URL/domain breaks validation) — note the app code itself only reads this variable for the auth redirects; passkey domain binding was not verified against it in this pass.
- Fallback if unset on Vercel: `getSiteURL()` pins to the hardcoded production domain (never the per-deployment `VERCEL_URL`), so it degrades safely, but it should still be set explicitly.
- **New `.env.example`** documents every variable (Supabase keys, `NEXT_PUBLIC_SITE_URL`, the local-only mock-auth vars). `.gitignore` previously ignored `.env*` entirely, so an `!.env.example` exception was added.
- **Validation**: there is no central env schema, so `next.config.ts` now `console.warn`s at build/server start when `NODE_ENV === "production"` and `NEXT_PUBLIC_SITE_URL` is unset (a warning, not a build failure). `tsc --noEmit`/`eslint`/`npm run build` clean with the variable unset locally.


## Open Finance Environment Variables (2026-10-01)

- New optional server-side variables, documented in `.env.example`: `ALTAREQ_SANDBOX_MODE`, `ALTAREQ_CLIENT_ID`, `ALTAREQ_AUTH_URL`, `ALTAREQ_TOKEN_URL`, `ALTAREQ_API_BASE_URL`, `ALTAREQ_REDIRECT_URI` (`https://www.opeswealth.app/dashboard/banking/callback`), `ALTAREQ_CLIENT_CERT`/`ALTAREQ_CLIENT_KEY` (mTLS), and `BANK_TOKEN_ENCRYPTION_KEY` (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). `SUPABASE_SERVICE_ROLE_KEY` (already present in Vercel) is also used by the bank-token code. **Do not set `ALTAREQ_SANDBOX_MODE` in production.** Nothing needs to be set for the app to keep working: without them the Connect bank button is simply disabled. See [[Market-Data-Integration|Market Data Integration]].


## AI Help Assistant Environment Variables (2026-10-01)

- `ANTHROPIC_API_KEY` (required for the chat; without it the widget reports it isn't set up), `ASSISTANT_MODEL` (optional, default `claude-sonnet-5-5`).
- Daily bug flush: `CRON_SECRET` (Vercel sends it as a Bearer token to the cron in `vercel.json`), plus a destination: `GITHUB_ISSUES_TOKEN` + `GITHUB_ISSUES_REPO` (`owner/name`; token needs Issues write) and/or `BUG_REPORT_WEBHOOK_URL`. Apply migration `0021` first. Details: [[Architecture|Architecture]].

## Related
- [[Database-Schema|Database Schema]] — migrations to apply to the production database
- [[Live-Pricing|Live Pricing]] — `FINNHUB_API_KEY` secret set and functions deployed (2026-09-30)
- [[Authentication-Security|Authentication & Security]] — `NEXT_PUBLIC_SITE_URL`
