# Opes Wealth — handoff summary for Gemini

**Last updated:** 2026-10-06, after pushing commit `410d4ff` to `master` (`origin/master` is identical).
Paste this whole file into Gemini as project context. It contains no secrets: only variable names and status. The assistant keeps this file current after every unit of work; re-copy it each time.

## Project
Opes Wealth: wealth-tracking web app for high-net-worth individuals. Next.js 16 (App Router, Turbopack), TypeScript, Tailwind, shadcn/ui, Zustand, Supabase (Postgres + Auth + Storage, project ref `lpaollycwokxejrihrap`, Mumbai), hosted on Vercel (project `opes-wealth`), live at https://www.opeswealth.app. Repo: `sch-navdev/opes-wealth` on GitHub, branch `master`. Local path: `...\Opes Wealth\opes-wealth`. The repo root is also an Obsidian vault: `PROJECT_TRACKER.md` is the hub and `tracker/*.md` has one note per module (20), plus one `Changelog.md` line per unit of work.

Note for any AI editing Next.js code here: this is a newer Next.js with breaking changes. Read `node_modules/next/dist/docs/` first (see `AGENTS.md`).

## Toolchain (current)
Node 24.19 locally (no `nvm`). Vitest 5.0.3, `@types/node` ^22.0.0, config `vitest.config.mts`. Commands: `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`. All pass: 37 test files, 1066 tests, no `it.fails` left.

## History in order
1. **Start of session (2026-10-06):** user had worked on an AWS EC2 instance and pulled to the local Windows machine. Repo was the only record. Built the Orchestrator workflow (Planner, Coder, Challenger, Tester, Documenter as sub-agents).
2. **Verification:** `npm install` (zustand was missing), then tsc, eslint and build passed. Live Supabase checked read-only against `supabase/migrations/` (0001–0032 all applied, no drift in the objects checked; MCP `list_migrations` shows only 7 because later ones were applied via SQL editor; spot check, not a full db diff).
3. **Tracker corrected** for stale "not applied / not deployed" lines.
4. **Keys:** compared supplied keys against `.env.local` by status code only. Supabase service key replaced (old one 401), Resend key updated, `VERCEL_TOKEN` added. GitHub token rejected (401), not written. Nothing rotated (user declined). `.env.local` is gitignored.
5. **Tests added** (Vitest 3 first): 35 files / 1039 tests for pure logic, with 13 suspected source bugs recorded as `it.fails`. Commit `ee9a06d`.
6. **Step 1, environment upgrade (`405f549`):** Vitest 3 to 5.0.3, `@types/node` 20 to 22, config renamed to `.mts`. Node was already 24, so it was not downgraded to 22.
7. **Step 2, bugs fixed (`483022e`, `d6e8af8`):** all 13 `it.fails` fixed and flipped to normal tests (1042 tests). Fixes: calendar-date validation in `parsers/generic-csv.ts` and `tenancy-parser.ts`; European amounts (`1.234,56`, `12,5`) in `bank-csv.ts` (a lone comma plus 3 digits stays US thousands); CSV intro line above the header in `parsers/sharesight.ts` and `saxo.ts`; physical line numbers in `banking/csv-profiles.ts`; month-end clamping in `amortization.ts` and `portfolio-performance.ts`; `vehicle-depreciation.ts` NaN below -100% and the Hyundai i30/i40 EV regex; holding-company cycles in `companies.ts`. Three parallel agents did it; the orchestrator re-ran the whole gate.
8. **Step 3, dashboard by UI tier (`bfc8c79`):** `src/app/dashboard/page.tsx` stays a server component that loads everything once; each block is wrapped in client `<TierGate section="…">` (`src/components/tier-gate.tsx`) reading `useUiTierStore`. Visibility map and pure data builders in `src/lib/dashboard-tiers.ts` (tested). UI preference only, not access control.
   - **Basic:** `dashboard-basic-overview.tsx`: net worth, allocation donut, top 5 holdings, Add asset. No IRR/amortization/performance chart.
   - **Standard / Professional:** bento header, metric cards, performance chart, cash flow (passive income + cash cards, reused), quick-add row (Add Investments / Liability / Asset), CSV card, portfolio table. Professional adds Future Projects and Reports & Exports.
   - **Expert:** `dashboard-expert-panels.tsx` fed by pure `lib/dashboard-expert.ts`: raw data table, private equity valuations (DPI, TVPI, projected IRR), tax & depreciation toggles, currency x category exposure heatmap.
9. **Step 4, polish (`3bb60f2`):** bento tiles use a per-tier staggered entrance (basic fade only; standard 75 ms/300 ms/8 px; professional 60/350/8; expert 35/200/4; `motion-reduce` respected). `dashboard-csv-card.tsx` is a standalone CSV upload tile (reuses the existing dropzone and column mapper; needs at least one Cash account); dropzone got an aria-label and polite live status. Its component file landed in the Step 3 commit because `page.tsx` imports it.
10. **Docs:** `tracker/Testing.md`, `tracker/Portfolio-Dashboard.md` (new "Dashboard by UI tier" section), `tracker/Design-System.md`, `tracker/Changelog.md`, hub test counts (`410d4ff`).
11. **Pushed:** `ee9a06d..410d4ff` to `origin/master`.

## Caveats on the new dashboard work
- Tax estimate is illustrative only: a user-typed rate (default 0) on per-asset positive unrealised gains, no loss offsetting, not saved, not tax advice.
- "Cash flow tracking" reuses the existing passive-income and cash cards; there is no new cash-flow model.
- The tier is read from localStorage after mount, so a Basic user briefly sees the Standard layout on load.
- Expert PE and tax figures read commitment, calls, distributions and purchase price from asset metadata, assumed NOT scaled to a co-owner's share (current value is), so co-owned assets may show full amounts there.
- Browser-verified in the dev preview (mock auth, dark and light) for Basic and Expert only. Professional and mobile layouts, and the Basic donut legend (labels truncate, "Private E…"), were not checked.
- Components are not unit-tested (node test environment, no DOM); only the pure logic is.

## Open items (not done)
- Observations not asserted as bugs: Saxo/Sharesight date parsing can be a day early in timezones ahead of UTC (UAE); empty Brokerage becomes 0; `bluebook-parser` drops lines containing "ref", "vin" or "tel"; 26 base UI translation keys fall back to English in all 7 overlay languages (plus the new dashboard-tier keys exist in EN and FR only).
- Vercel Function Region should be Mumbai (bom1); confirm `NEXT_PUBLIC_SITE_URL` and env vars (especially the Supabase service key) in Vercel.
- Invite emails land in Hotmail junk (DMARC `p=none` without `rua`, no MX on root domain).
- Demo re-seed (`scripts/seed-demo.mts --yes`); Porsche asset data may be off from an old scaled-edit bug (the Expert tax panel shows a purchase price of about $17k against a value of about $46k).
- Registered co-owner approval path with two real accounts untested; no end-to-end or component tests.
- A working GitHub token is needed for bug-report-to-GitHub-issues (`GITHUB_ISSUES_TOKEN`, `GITHUB_ISSUES_REPO`).
- `npm audit` reports 6 vulnerabilities (5 high, 1 critical); not looked at.

## Working rules Steve set
Commit and push are separate, confirmed each time. Never retry denied production DB operations: give the SQL instead. Update the matching `tracker/*.md` note and add exactly one Changelog line after each unit of work. Use Write/Edit rather than shell quoting for code. Keep this handoff file updated after every unit of work.
