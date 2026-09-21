[[PROJECT_TRACKER|← Project Tracker]]

# Authentication & Security

**Status:** Done — Phase 1, Steps 3, 5 and 6 (login/signup, TOTP 2FA, Passkeys, Remember Me).

## Supabase Client & Auth Middleware
- `src/utils/supabase/client.ts` — browser client via `createBrowserClient` (`@supabase/ssr`).
- `src/utils/supabase/server.ts` — server client via `createServerClient` + Next.js `cookies()`, for use in Server Components/Actions/Route Handlers.
- `src/utils/supabase/middleware.ts` — `updateSession()` helper that refreshes the Supabase auth session on each request using `NextRequest`/`NextResponse`.
- `src/middleware.ts` — wires `updateSession` into Next.js middleware, matching all routes except `_next/static`, `_next/image`, `favicon.ico`, and image assets.
- Env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) live in `.env.local` (gitignored, not committed).
- Note: Next.js 16 deprecated the `middleware.ts` file convention in favor of `proxy.ts` (build succeeds with a deprecation warning). Left as `middleware.ts` per current instructions; migrate later with `npx @next/codemod@canary middleware-to-proxy` if desired.
- `next.config.ts` — `experimental.serverActions.bodySizeLimit` raised to `'5mb'` (default is 1MB), so the Base64 avatar upload in the [[Profile-Settings|Profile Settings]] form doesn't get rejected by the server action payload limit.

## Authentication UI & Protected Routes
- `src/app/auth/actions.ts` — server actions `login(formData)`, `signup(formData)`, and `logout()`, calling `supabase.auth.signInWithPassword` / `signUp` / `signOut` via the server client from `src/utils/supabase/server.ts`. On success they redirect to `/dashboard` (or `/login` for logout); on failure they return `{ error: string }`.
- `src/app/login/page.tsx` + `src/app/login/login-form.tsx` — dark-luxury-themed login card (shadcn `Card`/`Input`/`Label`/`Button`) with separate Login and Sign Up buttons wired to the respective server actions via a client component that surfaces returned error messages.
- `src/app/dashboard/page.tsx` — Server Component; calls `supabase.auth.getUser()` and redirects unauthenticated visitors to `/login`. Renders a header with the user's email and a Sign Out form bound to the `logout` server action.
- Installed shadcn `card`, `input`, `button`, `label` components (`src/components/ui/`). Normalized their generated imports to use the project's own `cn` helper from `@/lib/utils` instead of the CLI's default `cn` npm package, so styling utilities stay consistent across the codebase; removed the now-unused `cn` package.

## TOTP 2FA
- `src/app/auth/actions.ts` — `login()` now checks `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` after password sign-in; if `nextLevel === 'aal2'` and MFA hasn't been satisfied yet, redirects to `/login/mfa` instead of `/dashboard`. Added `verifyMfaLogin(code)`, which finds the enrolled TOTP factor via `listFactors()`, opens a `challenge()`, and `verify()`s the submitted code, redirecting to `/dashboard` on success.
- `src/app/login/mfa/page.tsx` + `mfa-form.tsx` — Client Component form for the 6-digit login-time code, calling `verifyMfaLogin`.
- `src/app/dashboard/mfa/page.tsx` + `setup-2fa-form.tsx` — 2FA enrollment UI. Client Component calls `supabase.auth.mfa.enroll({ factorType: 'totp' })` (browser client), renders the returned TOTP QR code SVG via `dangerouslySetInnerHTML`, then challenges/verifies the first code to activate the factor.
- `src/app/dashboard/page.tsx` — now also fetches the AAL level; if `nextLevel === 'aal2'` while `currentLevel === 'aal1'` (password-only session, MFA not yet satisfied), redirects to `/login/mfa` before rendering anything. The "Manage two-factor authentication" link was later moved to [[Profile-Settings|Profile Settings]] (see below).

## Passkeys & Remember Me
- **Remember Me**: `src/utils/supabase/server.ts`'s `createClient()` now takes `{ rememberMe?: boolean }`. Its `setAll` cookie handler strips `maxAge`/`expires` when `rememberMe` is false, turning the session cookie into a browser-session-only cookie instead of `@supabase/ssr`'s default persistent one. `login()` in `actions.ts` reads the `rememberMe` checkbox from the form and passes it through. Caveat: `src/utils/supabase/middleware.ts` refreshes the session on every request using its own `setAll` (unmodified, always persistent) — a true "session-only" cookie may get re-persisted on the next request; revisit if this matters in practice.
- **Passkeys**: the task's requested method names (`signInWithWebAuthn()`, and a bare `mfa.enroll({ factorType: 'webauthn' })` completing enrollment by itself) don't exist/aren't sufficient in the installed `@supabase/supabase-js` (`2.116.0`). Standardized on Supabase's standard passwordless Passkey system (`auth.signInWithPasskey()` / `auth.registerPasskey()`), not the MFA-factor-based `mfa.webauthn.*` API — the latter was tried first but this project's Supabase instance rejects it ("MFA enroll is disabled for WebAuthn").
  - `src/utils/supabase/client.ts` — browser client enables `auth.experimental.passkey: true`, required for the passkey APIs.
  - `src/app/login/login-form.tsx` — outlined Champagne Gold "Sign in with Passkey" button calling `supabase.auth.signInWithPasskey()` (passwordless sign-in via device passkey), client-side only. Wrapped in try/catch: any thrown error (cancelled OS prompt, no passkey found) clears the loading state and shows "No passkey found. Please log in with your email and password, then register a passkey in your dashboard."
  - `src/app/dashboard/mfa/setup-2fa-form.tsx` — "Register Passkey" button calling `supabase.auth.registerPasskey()` (also try/catch wrapped), which drives the full browser credential-creation ceremony and verification in one call.
  - **Passkey-satisfies-aal2 bypass** (`src/utils/supabase/mfa.ts`, new): `needsMfaStepUp(supabase)` computes the AAL as before, but if a step-up would otherwise be required, it also decodes the session's `amr` (via `supabase.auth.getClaims()`) and treats a `webauthn` entry as sufficient on its own — Supabase's own AAL calculation only credits `mfa/*`-namespaced methods, not the standalone Passkey system, so without this a Passkey login would still get bounced to `/login/mfa`. Used by both `login()` in `actions.ts` and `dashboard/page.tsx`, replacing their previous inline `getAuthenticatorAssuranceLevel()` checks.
  - **Resolved**: `src/app/login/mfa/mfa-form.tsx`'s dead "Verify with Passkey" button (it looked for a `webauthn` MFA factor that registration no longer creates) has been removed. The component is back to a plain TOTP code form — Passkey logins bypass `/login/mfa` entirely via the AAL2 bypass above, so no passkey UI belongs on this page at all.
  - **Updated (codebase audit pass)**: `setup-2fa-form.tsx`'s single merged "Active authenticators" list has been split into two clearly-labeled sections ("Authenticator App" and "Passkeys") instead of one `ActiveFactor[]` presenting TOTP and Passkeys as interchangeable. `verifyMfaLogin` in `auth/actions.ts` now has a doc comment explaining it's intentionally TOTP-only, since passkey sessions never reach it. See [[Codebase-Audits|Codebase Audits]].
  - **Resolved**: the debug `console.log(aal.currentAuthenticationMethods)` added to `mfa.ts` to capture the real AMR method string has been removed. Per the values reported back from a real device login, `needsMfaStepUp()` now checks for both `"passkey"` and `"webauthn"` in `currentAuthenticationMethods` (instant, permanent bypass) and in the `amr` claim fallback check — not just `"webauthn"` as before.

## Related
- [[Database-Schema|Database Schema]] — `profiles` row auto-creation on signup (`0002_user_profile_trigger.sql`)
- [[Profile-Settings|Profile & Settings]] — MFA management link now lives on `/dashboard/settings`
- [[Codebase-Audits|Codebase Audits]] — Passkey/TOTP UI separation, AMR check fixes
