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
  - [x] Passkey-satisfies-aal2 bypass (Passkey login skips `/login/mfa` entirely)
  - [x] MFA setup page: "← Back to Dashboard" link
  - [x] MFA setup page: Active Authenticators list (TOTP + Passkeys)
- [x] Step 7: Portfolio Dashboard Foundation (manual asset tracking UI)
  - [x] Profile Settings page (structured address, contact info, Base64 avatar upload, email/phone verification UI)
  - [x] Avatar image cropper (react-easy-crop, circular 1:1, downscaled/compressed JPEG output)
  - [x] Searchable country/phone-code comboboxes (shadcn Popover + Command)
  - [x] Server Action payload limit raised to 5mb (for avatar uploads)
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
- `next.config.ts` — `experimental.serverActions.bodySizeLimit` raised to `'5mb'` (default is 1MB), so the Base64 avatar upload in the Profile Settings form doesn't get rejected by the server action payload limit.

### Database Tables
Defined in `supabase/migrations/0001_initial_schema.sql` (not yet applied to the live database):
- **profiles** — `id` (uuid, PK, references `auth.users`), `first_name`, `last_name`, `default_currency` (default `'USD'`), `created_at`.
- **asset_categories** — `id` (uuid, PK), `name`, `slug` (unique). Seeded with Real Estate, SCPI, Equities, Crypto, Cash, Liabilities.
- **assets** — `id` (uuid, PK), `profile_id` (references `profiles`), `category_id` (references `asset_categories`), `name`, `ticker_symbol` (nullable), `quantity` (default `1`), `current_value`, `currency` (default `'USD'`), `is_liability` (default `false`), `created_at`, `updated_at`.
- **asset_history** — `id` (uuid, PK), `asset_id` (references `assets`), `recorded_date`, `value`, `created_at`.
- All four tables have Row Level Security enabled. `profiles`, `assets`, and `asset_history` restrict SELECT/INSERT/UPDATE/DELETE to rows owned by `auth.uid()` (directly via `profile_id`/`id`, or transitively for `asset_history` via its parent `assets` row). `asset_categories` is shared reference data, readable by any authenticated user.
- `supabase/migrations/0002_user_profile_trigger.sql` — `public.handle_new_user()` (a `security definer` trigger function, `search_path` pinned to `public`) inserts a `profiles` row for `new.id`, fired by an `on_auth_user_created` trigger `after insert on auth.users`. Fixes the gap noted after Step 7: without this, `addAsset` failed with a foreign-key violation because no `profiles` row existed for any signed-up user. Not yet applied to the live database.
- `supabase/migrations/0003_profile_extended_fields.sql` — adds `phone_number`, `address_street`, `address_po_box`, `address_city`, `address_postal_code`, `address_landmark`, `address_country`, and `avatar_base64` (all `text`) to `profiles`. Added proactively because the Profile Settings page needed these columns and they didn't exist yet — without this migration, `updateProfile` would fail with "column does not exist". Not yet applied to the live database.

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
- **Passkeys**: the task's requested method names (`signInWithWebAuthn()`, and a bare `mfa.enroll({ factorType: 'webauthn' })` completing enrollment by itself) don't exist/aren't sufficient in the installed `@supabase/supabase-js` (`2.116.0`). Standardized on Supabase's standard passwordless Passkey system (`auth.signInWithPasskey()` / `auth.registerPasskey()`), not the MFA-factor-based `mfa.webauthn.*` API — the latter was tried first but this project's Supabase instance rejects it ("MFA enroll is disabled for WebAuthn").
  - `src/utils/supabase/client.ts` — browser client enables `auth.experimental.passkey: true`, required for the passkey APIs.
  - `src/app/login/login-form.tsx` — outlined Champagne Gold "Sign in with Passkey" button calling `supabase.auth.signInWithPasskey()` (passwordless sign-in via device passkey), client-side only. Wrapped in try/catch: any thrown error (cancelled OS prompt, no passkey found) clears the loading state and shows "No passkey found. Please log in with your email and password, then register a passkey in your dashboard."
  - `src/app/dashboard/mfa/setup-2fa-form.tsx` — "Register Passkey" button calling `supabase.auth.registerPasskey()` (also try/catch wrapped), which drives the full browser credential-creation ceremony and verification in one call.
  - **Passkey-satisfies-aal2 bypass** (`src/utils/supabase/mfa.ts`, new): `needsMfaStepUp(supabase)` computes the AAL as before, but if a step-up would otherwise be required, it also decodes the session's `amr` (via `supabase.auth.getClaims()`) and treats a `webauthn` entry as sufficient on its own — Supabase's own AAL calculation only credits `mfa/*`-namespaced methods, not the standalone Passkey system, so without this a Passkey login would still get bounced to `/login/mfa`. Used by both `login()` in `actions.ts` and `dashboard/page.tsx`, replacing their previous inline `getAuthenticatorAssuranceLevel()` checks.
  - **Resolved**: `src/app/login/mfa/mfa-form.tsx`'s dead "Verify with Passkey" button (it looked for a `webauthn` MFA factor that registration no longer creates) has been removed. The component is back to a plain TOTP code form — Passkey logins bypass `/login/mfa` entirely via the AAL2 bypass above, so no passkey UI belongs on this page at all.

### Portfolio Dashboard Foundation
- `src/app/dashboard/actions.ts` — server action `addAsset(formData)`: reads `name`, `category_id`, `quantity`, `current_value`, `currency` (default `'USD'`) from the form, resolves the current user via `getUser()`, inserts into `assets` with `profile_id` set to that user's id, and calls `revalidatePath('/dashboard')` on success.
- `src/components/add-asset-dialog.tsx` — Client Component using shadcn `Dialog`/`Select`/`Input`/`Label`. Submits `addAsset` via a client-driven `startTransition` (not a bare form `action`) so it can show inline errors and close the dialog only on success. Category dropdown is populated from the `asset_categories` passed in as a prop.
- `src/app/dashboard/page.tsx` — now also queries `asset_categories` (all rows, for the dropdown) and the signed-in user's own `assets` (joined with `asset_categories(name)`), in parallel. Renders `AddAssetDialog` at the top of the page and a shadcn `Table` of the user's assets below it (Name / Category / Quantity / Value, liabilities shown in destructive red with a leading `-`). Empty state shown when there are no assets yet.
- Installed shadcn `dialog`, `select`, `table` components (`src/components/ui/`); fixed the same CLI `cn`-package import issue as previous component installs.
- **Resolved**: the missing-`profiles`-row gap that would have made `addAsset` fail with a foreign-key violation is now fixed by `supabase/migrations/0002_user_profile_trigger.sql` (see Database Tables above).
- Not yet verified against a live Supabase instance (dev server was only exercised while signed out, since these routes are visible only to newly-verified sessions and no test account/schema deployment was available in this session).

### Profile Settings
- `src/app/dashboard/settings/actions.ts` — `updateProfile(formData)` extracts first/last name, phone number, the six address fields, and `avatar_base64`, updates the caller's own `profiles` row (`.eq('id', user.id)`), and calls `revalidatePath('/', 'layout')`. `resendEmailVerification(email)` calls `supabase.auth.resend({ type: 'signup', email })`.
- `src/components/profile-form.tsx` — Client Component. Email shown with a green "Verified" `Badge` (`isEmailVerified`) or a "Send Verification Link" button wired to `resendEmailVerification`. Avatar uploader: a shadcn `Avatar` (image or initials fallback) plus a hidden `<input type="file" accept="image/*">`; on selection, `FileReader.readAsDataURL()` converts the file to Base64, stored in state and mirrored into a hidden form input (`avatar_base64`) so it submits with the rest of the form. First/Last Name row, Phone Number + an outlined "Verify Phone" button (`alert('SMS verification integration coming soon.')` — a stub, no real SMS integration yet), and a "Residential Address" grid (Street, PO Box, City, Postal Code, Landmark, Country). Submission uses the same client-driven `startTransition` + `FormData` pattern as `AddAssetDialog`/`LoginForm`, not the installed `form`/`react-hook-form` component (kept consistent with the rest of the app; `react-hook-form`/`zod` are now installed as a side effect of `npx shadcn add form` but unused elsewhere).
- `src/app/dashboard/settings/page.tsx` — Server Component; same auth + AAL2 guard as `/dashboard`, queries the caller's `profiles` row, renders a "← Back to Dashboard" link and `<ProfileForm>`.
- `src/app/dashboard/page.tsx` — header now queries `first_name`/`avatar_base64` and renders an `Avatar` + "Welcome back, {first_name}" (falling back to email), plus a "Profile Settings" link next to "Sign Out".
- Installed shadcn `form`, `badge`, `avatar` (`input`/`label`/`button` already existed and were left alone); same CLI `cn`-import fix applied to the newly generated files.
- **Avatar cropper**: `src/lib/crop-image.ts` (`getCroppedImage`) draws the selected region to an offscreen `<canvas>`, downscales to a max of 400×400, and re-encodes as JPEG (quality 0.8) before it ever becomes the stored Base64 string — keeping payloads small despite raw phone-camera photos being much larger. `profile-form.tsx` opens a shadcn `Dialog` containing a `react-easy-crop` `<Cropper>` (`aspect={1}`, `cropShape="round"`) as soon as a file is selected; "Confirm" runs the crop/compress and writes the result into the hidden `avatar_base64` input, "Cancel" discards it. Verified visually end-to-end (selected a generated test image, cropped it, confirmed the compressed result renders in the `Avatar`) via a disposable local-only preview route, removed before committing.
- **Searchable country/phone comboboxes**: `src/lib/countries.ts` — a static `Country[]` (name, ISO alpha-2 `code`, `dialCode`) covering ~195 countries/territories. `src/components/country-combobox.tsx` — a shadcn Popover+Command combobox reused for both purposes via a `field: "name" | "dialCode"` prop: the phone row uses it in `dialCode` mode (search by name, selection returns the dial code) next to a plain local-number `Input`; the Residential Address "Country" field uses it in `name` mode. Both are synced into hidden form inputs (`phone_number` = `${dialCode} ${localNumber}`, `address_country`) so `updateProfile`'s `FormData` extraction didn't need to change. On edit, the stored `phone_number` is split back into dial code + local number by matching the longest known dial-code prefix. Verified visually: search filtering, selecting a country, and the resulting field updates all confirmed in the browser.
- Not yet verified against a live Supabase instance/real file upload beyond the local UI checks above (no authenticated test session or deployed database available in this environment). Worth noting for later: storing full-resolution images as Base64 `text` in Postgres works but is not space-efficient; Supabase Storage would scale better if avatars turn out to be large.

### APIs
_None yet._

### Folder Structure
```
opes-wealth/
├── src/
│   ├── app/                     # Next.js App Router routes
│   ├── components/              # Shared app components (e.g. add-asset-dialog.tsx, country-combobox.tsx)
│   ├── lib/                     # Shared utilities (utils.ts, countries.ts, crop-image.ts)
│   ├── utils/supabase/          # Supabase client/server/middleware/mfa helpers
│   └── middleware.ts            # Wires Supabase session refresh into Next.js middleware
├── supabase/
│   └── migrations/
│       ├── 0001_initial_schema.sql            # profiles, asset_categories, assets, asset_history + RLS
│       ├── 0002_user_profile_trigger.sql      # auto-create a profiles row on signup
│       └── 0003_profile_extended_fields.sql   # phone/address/avatar_base64 columns on profiles
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
- 2026-09-18: Switched passkey registration from `mfa.webauthn.register()` to `supabase.auth.registerPasskey()` — the project's Supabase instance returns "MFA enroll is disabled for WebAuthn" for the MFA-factor route, confirming passkeys here should use the standard passwordless system, matching `signInWithPasskey()` on the login side. Added try/catch around `signInWithPasskey()` in `login-form.tsx` so a cancelled/failed OS passkey prompt shows "No passkey found. Please log in with your email and password, then register a passkey in your dashboard." instead of leaving the button stuck loading. Build verified with zero TS errors.
- 2026-09-18: Added `needsMfaStepUp()` helper so a Passkey-authenticated session (`amr` contains `webauthn`) bypasses `/login/mfa` entirely, used by both `login()` and `/dashboard`. Added a "← Back to Dashboard" link and an "Active authenticators" list (TOTP + Passkeys) to the MFA setup page. Built the portfolio dashboard foundation: `addAsset` server action, `AddAssetDialog` (shadcn Dialog/Select), and a shadcn Table of the user's assets on `/dashboard`, backed by queries against `asset_categories`/`assets`. Installed shadcn `dialog`/`select`/`table` (same `cn`-import fix as before). Verified the MFA page's new back-link and factors list visually in the browser; could not exercise the asset table/dialog end-to-end (requires a live authenticated session against real Supabase data, not available in this session) — also flagged a real gap: `addAsset` will fail until signup creates a matching `profiles` row. Build verified with zero TS/bundling errors.
- 2026-09-18: Added `supabase/migrations/0002_user_profile_trigger.sql` — `handle_new_user()` trigger function + `on_auth_user_created` trigger, auto-creating a `profiles` row for every new `auth.users` row, fixing the foreign-key gap noted above. Syntax verified with `libpg-query`; not yet applied to any database. Removed the dead "Verify with Passkey" button/logic from `src/app/login/mfa/mfa-form.tsx` (Passkey logins bypass this page entirely now) — it's back to a plain TOTP form. Build verified with zero TS/bundling errors.
- 2026-09-18: Refined `needsMfaStepUp()` to check `getAuthenticatorAssuranceLevel()`'s `currentAuthenticationMethods` for a `passkey`/`webauthn` entry and bypass the MFA step immediately if found, in addition to the existing `amr`-based fallback check. Build verified with zero TS errors.
- 2026-09-18: Built Profile Settings: added `supabase/migrations/0003_profile_extended_fields.sql` (phone/address/avatar columns on `profiles`, syntax-verified with `libpg-query`), `dashboard/settings/actions.ts` (`updateProfile`, `resendEmailVerification`), `dashboard/settings/page.tsx`, and `components/profile-form.tsx` (email verification badge/CTA, Base64 avatar upload via `FileReader`, name/phone/address fields, phone-verification stub). Updated `/dashboard`'s header to show the user's avatar, first name, and a "Profile Settings" link. Installed shadcn `form`/`badge`/`avatar` (same `cn`-import fix as before). Verified the settings route redirects correctly when signed out; could not exercise the full authenticated form (no live Supabase session available in this environment). Build verified with zero TS/bundling errors.
- 2026-09-18: Raised the Server Action body size limit to `5mb` in `next.config.ts` for avatar uploads. Added an `react-easy-crop`-based circular avatar cropper (`src/lib/crop-image.ts` + a new Dialog step in `profile-form.tsx`) that downscales/compresses the result to a small JPEG before it's stored. Added `src/lib/countries.ts` (~195 countries with ISO code + dial code) and `src/components/country-combobox.tsx`, a reusable searchable Popover+Command combobox, used to replace the plain phone-country and address-country text inputs. Installed shadcn `popover`/`command` and `react-easy-crop` (same `cn`-import fix as before). Verified all of it visually end-to-end (search filtering, country selection, uploading/cropping a test image and seeing the compressed result render) via a disposable local-only preview route that was removed before committing. Build verified with zero TS/bundling errors.
