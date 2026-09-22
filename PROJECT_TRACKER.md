> **Rule for Claude Code:** see `CLAUDE.md` for how to keep this vault in sync after every step. Update the relevant note under `tracker/`, not this file — this file stays a short hub.

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
- [x] Step 2: Design System Implementation — [[Design-System|Design System]]
- [x] Step 3: Supabase Client & Auth Middleware setup — [[Authentication-Security|Authentication & Security]]
- [x] Step 4: Database Schema Generation — [[Database-Schema|Database Schema]]
- [x] Step 5: Authentication UI & Protected Routes — [[Authentication-Security|Authentication & Security]]
- [x] Step 6: TOTP 2FA Implementation (Passkeys, Remember Me) — [[Authentication-Security|Authentication & Security]]
- [x] Step 7: Portfolio Dashboard Foundation — [[Portfolio-Dashboard|Portfolio Dashboard]]
  - [x] Profile Settings — [[Profile-Settings|Profile & Settings]]
  - [x] Advanced Real Estate schema, multi-currency, off-plan tracking — [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]]
  - [x] Edit/Delete asset actions — [[Portfolio-Dashboard|Portfolio Dashboard]]
  - [x] Asset image/logo upload & portfolio avatar display — [[Portfolio-Dashboard|Portfolio Dashboard]]
  - [x] Dedicated asset details page & clickable portfolio rows — [[Portfolio-Dashboard|Portfolio Dashboard]]
  - [x] Historical graphs, multi-image carousel, linked loans, and Aperçu/Analyse/Paramètres tabs — [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]]
  - [x] Global privacy mode toggle with masked financial data — [[Privacy-Mode|Privacy Mode]]
  - [x] English/French localization toggle (partial — asset details page + dashboard chrome) — [[Localization|Localization]]
  - [x] Login page redesign (hand-built, 21st.dev unavailable) — [[Authentication-Security|Authentication & Security]]
  - [x] Dashboard metric cards (hand-built, 21st.dev unavailable) — [[Portfolio-Dashboard|Portfolio Dashboard]]
  - [x] Light/dark theme toggle (`next-themes`) — [[Design-System|Design System]]
  - [x] Dev-only mock-auth bypass for `/dashboard`, verified against real Manarat Living III data — [[Authentication-Security|Authentication & Security]]
  - [x] Sign-up form: Confirm Password validation + First/Last Name → `profiles` via updated signup trigger — [[Authentication-Security|Authentication & Security]]
  - [x] ADREC/DARI integration design (no code, gate explicitly lifted by user request) — [[Market-Data-Integration|Market Data Integration]]
  - [x] Vehicles/Private Equity: schema (seeded categories) + TypeScript metadata types, no UI yet — [[Database-Schema|Database Schema]]
  - [x] Generated-type reconciliation (`Database` wired into all Supabase clients) + 2 `[TEST]` rows validating the new categories live — [[Database-Schema|Database Schema]]
  - [x] Vehicles/Private Equity Settings-tab detail views, verified live (dark + light) — [[Portfolio-Dashboard|Portfolio Dashboard]]
- [ ] Step 8: CSV bank uploads — [[CSV-Bank-Uploads|CSV Bank Uploads]]
- [ ] Step 9: Live pricing integration — [[Live-Pricing|Live Pricing]]
- [ ] Step 10: Deployment (Vercel) — [[Deployment|Deployment]]

## Modules

- [[Architecture|Architecture]] — quick-orientation reference: stack, verified live schema, financial formulas, theming, localization, mock auth
- [[Design-System|Design System]] — theme, tokens, shadcn/ui styling
- [[Authentication-Security|Authentication & Security]] — login/signup, TOTP 2FA, Passkeys, Remember Me, middleware
- [[Database-Schema|Database Schema]] — Supabase tables, RLS, migrations
- [[Portfolio-Dashboard|Portfolio Dashboard]] — asset list, add/edit/delete
- [[Profile-Settings|Profile & Settings]] — profile form, avatar, verification
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — real estate metadata, off-plan tracking, FX conversion
- [[CSV-Bank-Uploads|CSV Bank Uploads]] — planned, Step 8
- [[Live-Pricing|Live Pricing]] — planned, Step 9
- [[Deployment|Deployment]] — planned, Step 10
- [[Market-Data-Integration|Market Data Integration]] — design-only ADREC/DARI outline; Vehicles and Private Equity are seeded categories with typed metadata shapes but no UI yet
- [[Codebase-Audits|Codebase Audits]] — periodic review/cleanup passes
- [[Privacy-Mode|Privacy Mode]] — global visibility toggle masking financial figures
- [[Localization|Localization]] — English/French toggle (partial coverage)
- [[Changelog|Changelog]] — full chronological history

## Folder Structure
```
opes-wealth/
├── src/
│   ├── app/                     # Next.js App Router routes
│   ├── components/              # Shared app components
│   ├── lib/                     # Shared utilities
│   ├── utils/supabase/          # Supabase client/server/middleware/mfa helpers
│   └── middleware.ts            # Wires Supabase session refresh into Next.js middleware
├── supabase/
│   └── migrations/
│       ├── 0001_initial_schema.sql
│       ├── 0002_user_profile_trigger.sql
│       ├── 0003_profile_extended_fields.sql
│       ├── 0004_real_estate_and_currency.sql
│       ├── 0005_asset_image.sql
│       └── 0006_asset_images_loans_history.sql
├── components.json              # shadcn/ui config (style: new-york, baseColor: zinc)
├── .env.local                   # Supabase URL/anon key (gitignored)
├── PROJECT_TRACKER.md           # hub note — start here (this file)
└── tracker/                     # one note per module, linked from this hub
    ├── Design-System.md
    ├── Authentication-Security.md
    ├── Database-Schema.md
    ├── Portfolio-Dashboard.md
    ├── Profile-Settings.md
    ├── Real-Estate-Multi-Currency.md
    ├── CSV-Bank-Uploads.md
    ├── Live-Pricing.md
    ├── Deployment.md
    ├── Codebase-Audits.md
    └── Changelog.md
```
