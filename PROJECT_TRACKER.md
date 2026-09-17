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
- [ ] Step 2: Database schema (Supabase)
- [ ] Step 3: Authentication (TOTP 2FA)
- [ ] Step 4: Manual asset tracking
- [ ] Step 5: CSV bank uploads
- [ ] Step 6: Live pricing integration
- [ ] Step 7: Deployment (Vercel)

## Architecture Log

### Database Tables
_None yet — to be documented once schema work begins._

### APIs
_None yet._

### Folder Structure
```
opes-wealth/
├── src/
│   ├── app/            # Next.js App Router routes
│   └── lib/            # Shared utilities (e.g. utils.ts)
├── components.json     # shadcn/ui config (style: new-york, baseColor: zinc)
└── PROJECT_TRACKER.md
```

## Changelog
- 2026-09-17: Project scaffolded with Next.js (TypeScript, Tailwind, ESLint, App Router, `src/` dir); shadcn/ui initialized (New York, Zinc); Supabase client libraries installed; Git repo initialized and pushed to GitHub.
- 2026-09-17: PROJECT_TRACKER.md created.
