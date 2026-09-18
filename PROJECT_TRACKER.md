> **Rule:** Claude Code must update this document after completing each step.

# Opes Wealth — Project Tracker

## Project Name
Opes Wealth

## Tech Stack
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase
- Vercel

## Target Audience
High-net-worth individuals

## Phase 1 MVP Scope
- Manual asset tracking
- CSV bank uploads
- Live pricing for financial assets
- TOTP 2FA authentication

## Status & Milestones

### Phase 1 — MVP
- [x] Step 1: Project setup, shadcn/ui, Supabase libraries, Git repository
- [x] Step 2: Design System Implementation
- [x] Step 3: Supabase Client & Auth Middleware setup
- [x] Step 4: Database Schema Generation
- [x] Step 5: Authentication UI & Protected Routes
- [x] Step 6: TOTP 2FA Implementation
  - [x] Passkeys (WebAuthn sign-in + MFA enrollment/verification)
  - [x] Remember Me (persistent vs. session-only auth cookies)
- [ ] Step 7: Manual asset tracking
- [ ] Step 8: CSV bank uploads
- [ ] Step 9: Live pricing integration
- [ ] Step 10: Deployment (Vercel)

## Architecture Log

### Design System
Dark-mode-first luxury theme — "Midnight Navy & Champagne Gold" — implemented in `src/app/globals.css` via Tailwind v4 CSS-first `@theme` config. Background `#06101E`, cards `#151E32`, primary accent `#C69B3C` (champagne gold), destructive `#C41E3A`, success `#10B981`. Sharp, zero-radius corners (`--radius-lg/md/sm: 0px`) reinforce the luxury/precision aesthetic. Uses `tailwindcss-animate` plugin for animation utilities.

### Supabase Client & Auth Middleware
- `src/utils/supabase/client.ts` — browser client via `createBrowserClient` (`@supabase/ssr`).
- `src/utils/supabase/server.ts` — server client via `createServerClient` + Next.js `cookies()`, for use in Server Components/Actions/Route Handlers.
- `src/utils/supabase/middleware.ts` — `updateSession()` helper that refreshes the Supabase auth session on each request using `NextRequest`/`NextResponse`.
- `src/middleware.ts` — wires `updateSession` into Next.js middleware, matching all routes except `_next/static`, `_next/image`, `favicon.ico`, and image assets.
- Env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) live in `.env.local` (gitignored, not committed).
- Note: Next.js 16 deprecated the `middleware.ts` file convention in favor of `proxy.ts` (build succeeds with a deprecation warning). Left as `middleware.ts` per current instructions; migrate later with `npx @next/codemod@canary middleware-to-proxy` if desired.

### Database Tables
Defined in `supabase/migrations/0001_initial_schema.sql` (not yet applied to the live database):
- **profiles** — `id` (uuid, PK, references `auth.users`), `first_name`, `last_name`, `default_currency` (default `'USD'`), `created_at`.
- **asset_categories** — `id` (uuid, PK), `name`, `slug` (unique). Seeded with Real Estate, SCPI, Equities, Crypto, Cash, Liabilities.
- **assets** — `id` (uuid, PK), `profile_id` (references `profiles`), `category_id` (references `asset_categories`), `name`, `ticker_symbol` (nullable), `quantity` (default `1`), `current_value`, `currency` (default `'USD'`), `is_liability` (default `false`), `created_at`, `updated_at`.
- **asset_history** — `id` (uuid, PK), `asset_id` (references `assets`), `recorded_date`, `value`, `created_at`.
- All four tables have Row Level Security enabled. `profiles`, `assets`, and `asset_history` restrict SELECT/INSERT/UPDATE/DELETE to rows owned by `auth.uid()` (directly via `profile_id`/`id`, or transitively for `asset_history` via its parent `assets` row). `asset_categories` is shared reference data, readable by any authenticated user.

### Authentication UI & Protected Routes
- `src/app/auth/actions.ts` — server actions `login(formData)`, `signup(formData)`, and `logout()`, calling `supabase.auth.signInWithPassword` / `signUp` / `signOut` via the server client from `src/utils/supabase/server.ts`. On success they redirect to `/dashboard` (or `/login` for logout); on failure they return `{ error: string }`.
- `src/app/login/page.tsx` + `src/app/login/login-form.tsx` — dark-luxury-themed login card (shadcn `Card`/`Input`/`Label`/`Button`) with separate Login and Sign Up buttons wired to the respective server actions via a client component that surfaces returned error messages.
- `src/app/dashboard/page.tsx` — Server Component; calls `supabase.auth.getUser()` and redirects unauthenticated visitors to `/login`. Renders a header with the user's email and a Sign Out form bound to the `logout` server action.
- Installed shadcn `card`, `input`, `button`, `label` components (`src/components/ui/`). Normalized their generated imports to use the project's own `cn` helper from `@/lib/utils` instead of the CLI's default `cn` npm package, so styling utilities stay consistent across the codebase; removed the now-unused `cn` package.

### TOTP 2FA
- `src/app/auth/actions.ts` — `login()` now checks `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` after password sign-in; if `nextLevel === 'aal2'` and MFA hasn't been satisfied yet, redirects to `/login/mfa` instead of `/dashboard`. Added `verifyMfaLogin(code)`, which finds the enrolled TOTP factor via `listFactors()`, opens a `challenge()`, and `verify()`s the submitted code, redirecting to `/dashboard` on success.
- `src/app/login/mfa/page.tsx` + `mfa-form.tsx` — Client Component form for the 6-digit login-time code, calling `verifyMfaLogin`.
- `src/app/dashboard/mfa/page.tsx` + `setup-2fa-form.tsx` — 2FA enrollment UI. Client Component calls `supabase.auth.mfa.enroll({ factorType: 'totp' })` (browser client), renders the returned TOTP QR code SVG via `dangerouslySetInnerHTML`, then challenges/verifies the first code to activate the factor.
- `src/app/dashboard/page.tsx` — now also fetches the AAL level; if `nextLevel === 'aal2'` while `currentLevel === 'aal1'` (password-only session, MFA not yet satisfied), redirects to `/login/mfa` before rendering anything. Added a "Manage two-factor authentication" link to `/dashboard/mfa`.

### Passkeys & Remember Me
- **Remember Me**: `src/utils/supabase/server.ts`'s `createClient()` now takes `{ rememberMe?: boolean }`. Its `setAll` cookie handler strips `maxAge`/`expires` when `rememberMe` is false, turning the session cookie into a browser-session-only cookie instead of `@supabase/ssr`'s default persistent one. `login()` in `actions.ts` reads the `rememberMe` checkbox from the form and passes it through. Caveat: `src/utils/supabase/middleware.ts` refreshes the session on every request using its own `setAll` (unmodified, always persistent) — a true "session-only" cookie may get re-persisted on the next request; revisit if this matters in practice.
- **Passkeys**: the task's requested method names (`signInWithWebAuthn()`, and a bare `mfa.enroll({ factorType: 'webauthn' })` completing enrollment by itself) don't exist/aren't sufficient in the installed `@supabase/supabase-js` (`2.116.0`). Implemented with the SDK's actual equivalents instead:
  - `src/utils/supabase/client.ts` — browser client now enables `auth.experimental.passkey: true`, required for the passkey APIs.
  - `src/app/login/login-form.tsx` — outlined Champagne Gold "Sign in with Passkey" button calling `supabase.auth.signInWithPasskey()` (passwordless sign-in via device passkey), client-side only.
  - `src/app/dashboard/mfa/setup-2fa-form.tsx` — "Register Passkey" button calling `supabase.auth.mfa.webauthn.register({ friendlyName })`, which performs `mfa.enroll({ factorType: 'webauthn' })` plus the full browser credential-creation ceremony and verification in one call.
  - `src/app/login/mfa/mfa-form.tsx` — on mount, calls `listFactors()`; if a verified `webauthn` factor exists, shows a "Verify with Passkey" button calling `supabase.auth.mfa.webauthn.authenticate({ factorId })` (challenge + browser prompt + verify), alongside the existing 6-digit TOTP input.

### APIs
_None yet._

### Folder Structure
```
opes-wealth/
├── src/
│   ├── app/                     # Next.js App Router routes
│   ├── lib/                     # Shared utilities (e.g. utils.ts)
│   ├── utils/supabase/          # Supabase client/server/middleware helpers
│   └── middleware.ts            # Wires Supabase session refresh into Next.js middleware
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql  # profiles, asset_categories, assets, asset_history + RLS
├── components.json              # shadcn/ui config (style: new-york, baseColor: zinc)
├── .env.local                   # Supabase URL/anon key (gitignored)
└── PROJECT_TRACKER.md
```

## Changelog
- 2026-09-17: Project scaffolded with Next.js (TypeScript, Tailwind, ESLint, App Router, `src/` dir); shadcn/ui initialized (New York, Zinc); Supabase client libraries installed; Git repo initialized and pushed to GitHub.
- 2026-09-17: PROJECT_TRACKER.md created.
- 2026-09-17: Implemented Opes Wealth luxury design system (Midnight Navy & Champagne Gold, dark-mode-first, 0px border radii) in `globals.css`.
- 2026-09-17: Configured Supabase keys (`.env.local`) and implemented Supabase browser/server clients plus auth session-refresh middleware (`src/middleware.ts`). Build verified with zero TS/bundling errors.
- 2026-09-17: Generated initial wealth-tracking schema migration (`profiles`, `asset_categories`, `assets`, `asset_history`) with Row Level Security policies in `supabase/migrations/0001_initial_schema.sql`. Syntax verified with the real Postgres grammar (`libpg-query`); not yet applied to any database.
- 2026-09-18: Implemented authentication UI and protected dashboard: login/signup/logout server actions, `/login` page (shadcn Card/Input/Label/Button, dark luxury theme), and `/dashboard` as a protected Server Component redirecting unauthenticated users to `/login`. Verified visually in the browser (login page renders themed correctly; `/dashboard` redirects to `/login` when signed out). Build verified with zero TS/bundling errors.
- 2026-09-18: Implemented TOTP 2FA: login-time AAL2 check and redirect to `/login/mfa`, `verifyMfaLogin` server action, `/login/mfa` verification page, `/dashboard/mfa` enrollment page (QR code + activation), and AAL2 enforcement on `/dashboard`. Verified visually in the browser (both new pages render themed correctly). Build verified with zero TS/bundling errors.
- 2026-09-18: Implemented Passkeys (sign-in, MFA enrollment, MFA login verification) and Remember Me (session-only vs. persistent auth cookie). Substituted the SDK's real passkey APIs (`signInWithPasskey`, `mfa.webauthn.register`, `mfa.webauthn.authenticate`) for the non-existent `signInWithWebAuthn()` named in the request. Verified visually in the browser (Remember Me checkbox and outlined gold Passkey buttons render correctly on `/login` and `/dashboard/mfa`). Build verified with zero TS/bundling errors.
