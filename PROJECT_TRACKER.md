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
- [ ] Step 5: Authentication (TOTP 2FA)
- [ ] Step 6: Manual asset tracking
- [ ] Step 7: CSV bank uploads
- [ ] Step 8: Live pricing integration
- [ ] Step 9: Deployment (Vercel)

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
