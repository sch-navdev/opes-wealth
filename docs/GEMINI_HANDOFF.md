# Opes Wealth — handoff summary for Gemini

**Last updated: 2026-10-06 12:29 (Gulf Standard Time, UTC+4).** Latest local commit `183e61b`. Commits `b80a9ed`, `8273103` and `183e61b` are committed locally and NOT yet pushed to `origin/master` (everything up to `5f4ba00` is pushed). Check the "Push status" line at the bottom for the current state.
Paste this whole file into Gemini as project context. It contains no secrets: only variable names and status. The assistant keeps this file current after every unit of work; re-copy it each time.

## Project
Opes Wealth: wealth-tracking web app for high-net-worth individuals. Next.js 16 (App Router, Turbopack), TypeScript, Tailwind, shadcn/ui, Zustand, Supabase (Postgres + Auth + Storage, project ref `lpaollycwokxejrihrap`, Mumbai), hosted on Vercel (project `opes-wealth`), live at https://www.opeswealth.app. Repo: `sch-navdev/opes-wealth` on GitHub, branch `master`. Local path: `...\Opes Wealth\opes-wealth`. The repo root is also an Obsidian vault: `PROJECT_TRACKER.md` is the hub and `tracker/*.md` has one note per module (20), plus one `Changelog.md` line per unit of work.

Note for any AI editing Next.js code here: this is a newer Next.js with breaking changes. Read `node_modules/next/dist/docs/` first (see `AGENTS.md`).

## Toolchain (current)
Node 24.19 locally (no `nvm`). Vitest 5.0.3, `@types/node` ^22.0.0, config `vitest.config.mts`. Commands: `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`. All pass: 40 test files, 1125 tests, no `it.fails` left. (Do not run `npm run build` while the dev server is running: it breaks the dev server's HMR; restart the dev server afterwards.)

## History in order
1. **Start (2026-10-06):** user had worked on an AWS EC2 instance and pulled to the local Windows machine. Repo was the only record. Orchestrator workflow with sub-agents (Planner, Coder, Challenger, Tester, Documenter); the orchestrator re-runs tsc, eslint, tests and build before every commit.
2. **Verification:** `npm install` (zustand was missing), tsc/eslint/build passed. Live Supabase checked read-only against `supabase/migrations/` (0001–0032 all applied, no drift in the objects checked; MCP `list_migrations` shows only 7 because later ones were applied via SQL editor; spot check, not a full db diff). Tracker corrected for stale "not applied / not deployed" lines.
3. **Keys:** compared supplied keys against `.env.local` by status code only. Supabase service key replaced (old one 401), Resend key updated, `VERCEL_TOKEN` added. GitHub token rejected (401), not written. Nothing rotated (user declined). `.env.local` is gitignored.
4. **Tests added** (`ee9a06d`): 35 files / 1039 tests for pure logic, 13 suspected source bugs recorded as `it.fails`.
5. **Env upgrade (`405f549`):** Vitest 3 to 5.0.3, `@types/node` 20 to 22, config renamed `.mts`. Node was already 24.
6. **13 bugs fixed (`483022e`, `d6e8af8`):** calendar-date validation (`parsers/generic-csv.ts`, `tenancy-parser.ts`), European amounts in `bank-csv.ts`, CSV intro lines in Sharesight/Saxo, physical line numbers in `banking/csv-profiles.ts`, month-end clamping (`amortization.ts`, `portfolio-performance.ts`), depreciation NaN and Hyundai i30/i40 EV regex, holding-company cycles in `companies.ts`.
7. **Dashboard by UI tier (`bfc8c79`, `3bb60f2`):** `src/app/dashboard/page.tsx` stays a server component that loads everything once; each block is wrapped in client `<TierGate section="…">` reading the tier. Visibility map and pure data builders in `src/lib/dashboard-tiers.ts`.
   - **Basic:** `dashboard-basic-overview.tsx`: net worth, allocation donut, top 5 holdings, Add asset. No IRR/amortization/performance chart.
   - **Standard / Professional:** bento header, metric cards, performance chart, cash flow (existing passive-income + cash cards), quick-add row, CSV card (`dashboard-csv-card.tsx`), portfolio table. Professional adds Future Projects and Reports & Exports.
   - **Expert:** `dashboard-expert-panels.tsx` fed by pure `lib/dashboard-expert.ts`: raw data table, private equity valuations (DPI, TVPI, projected IRR), tax & depreciation toggles, currency x category exposure heatmap.
   - Per-tier staggered entrance animation (`tierMotion`, `tileEntranceStyle`).
8. **Docs/hygiene (`410d4ff`, `2204b21`, `5f4ba00`):** tracker counts, this handoff added, `.obsidian/workspace.json` untracked and gitignored. All pushed.
9. **Secondary bugs (`b80a9ed`):**
   - **Timezone date shift:** new `src/lib/parsers/dates.ts` `parseCellDateUtc`, used by `saxo.ts` and `sharesight.ts`. It reads calendar parts from text (never builds an instant) and uses local y/m/d for xlsx Date cells. Ambiguous `03/05/2025` stays month-first; `25/03/2025` is day-first. Regression tests set `process.env.TZ` (UTC, Asia/Dubai, America/Los_Angeles, Pacific/Kiritimati) and fail on the old code in zones ahead of UTC. Note: `new Date("YYYY-MM-DD")` was never wrong (it parses as UTC); the bug was non-ISO strings and Date cells.
   - **Empty Brokerage:** a blank/whitespace/null Sharesight Brokerage cell is now `undefined`, not 0; a real 0 stays 0. Saxo and generic-csv needed no change.
   - **Bluebook parser:** `SKIP_WORDS` substring regex replaced by whole-word skip labels, so "Reference value", "Preferred retail value", "Hotel" are kept; "Ref: 2025/123456", "VIN …", "Tel: …" still skipped; a line with a skip label AND a value word keeps the line and blanks only the identifier.
   - **Expert-panel co-ownership: NO code change, deliberately.** The brief asked to scale PE/tax figures by `ownership_percentage / 100`. That would double-scale: `ownership.ts#scaleAssetForOwner` (applied via `applyOwnershipFactors` before the page builds the panels) already scales PE commitment, called capital, distributions, capital calls, vehicle purchase price and real-estate money fields; there is no `ownership_percentage` on asset rows. New tests in `dashboard-expert.test.ts` prove amounts are exactly half at a 50% share and DPI/TVPI are unchanged. An earlier caveat in these notes saying they were unscaled was wrong and is corrected. Gotcha: `scaleAssetForOwner` reads `asset.category` (string), not `asset_categories.name`; use `applyOwnershipFactors` in tests.
10. **Tier hydration flash fixed (`8273103`):** the tier is also stored in a cookie `opes-ui-tier` (Path=/, 1 year, SameSite=Lax, Secure on https; non-sensitive UI preference, not access control). `app/dashboard/layout.tsx` reads it with `await cookies()` and passes it via `TierProvider` (React context only; the zustand store is never set on the server because module state is shared between requests). `useUiTier()` returns the cookie tier until the persisted store hydrates, then the store value; the sidebar uses the same hook. Verified by fetching `/dashboard` with each cookie value and checking the server HTML. Only a user with a stored non-default tier but no cookie yet sees one flash, once. Basic donut legend now wraps long labels. Basic/Standard/Expert checked at 375 px: no page overflow (tables and heatmap scroll inside their cards).
11. **Counters, sparklines, reduced motion (`183e61b`):** `NumberTicker` (already an rAF tween) now defaults to a critically damped spring (`lib/spring.ts`, no overshoot; `easing="cubic"` still available) and the three bento category tiles count too. `motion` package intentionally NOT added. Micro-sparklines: pure `lib/sparkline.ts` + `components/micro-sparkline.tsx`; `page.tsx` builds `sparkByAsset` (24 points per asset, base currency); shown on Top 5 Holdings (Basic, hidden below 360 px) and as a non-sortable Trend column in the sortable assets table. Reduced motion: `use-reduced-motion.ts` hook, counter jumps to the final value, sparkline draw-in only inside `@media (prefers-reduced-motion: no-preference)`; all `animate-in` uses already had `motion-reduce:animate-none`.

## Caveats
- Tax estimate (Expert) is illustrative only: user-typed rate (default 0) on per-asset positive unrealised gains, no loss offsetting, not saved, not tax advice.
- "Cash flow tracking" reuses the existing passive-income and cash cards; no new cash-flow model.
- Browser-verified in the dev preview (mock auth, real data): Basic and Expert (dark and light), Standard, mobile 375 px overflow, sparklines and Trend column, server-rendered tier via cookie. Professional tier layout and real reduced-motion OS setting were not checked. The Brokerage holdings table has no Trend column.
- Components are not unit-tested (node test environment, no DOM); only the pure logic is.

## Open items (not done)
- Observations not asserted as bugs: 26 base UI translation keys fall back to English in all 7 overlay languages; the new dashboard-tier, expert, sparkline and CSV card keys exist in EN and FR only.
- Vercel Function Region should be Mumbai (bom1); confirm `NEXT_PUBLIC_SITE_URL` and env vars (especially the Supabase service key) in Vercel.
- Invite emails land in Hotmail junk (DMARC `p=none` without `rua`, no MX on root domain).
- Demo re-seed (`scripts/seed-demo.mts --yes`); Porsche asset data may be off from an old scaled-edit bug (Expert tax panel shows purchase price about $17k vs value about $46k).
- Registered co-owner approval path with two real accounts untested; no end-to-end or component tests.
- A working GitHub token is needed for bug-report-to-GitHub-issues (`GITHUB_ISSUES_TOKEN`, `GITHUB_ISSUES_REPO`).
- `npm audit` reports 6 vulnerabilities (5 high, 1 critical); not looked at.

## Working rules Steve set
Commit and push are separate, confirmed each time. Never retry denied production DB operations: give the SQL instead. Update the matching `tracker/*.md` note and add exactly one Changelog line after each unit of work. Use Write/Edit rather than shell quoting for code. Keep this handoff file updated after every unit of work, and stamp the "Last updated" line at the top with the date and time (Gulf Standard Time, UTC+4) so Steve can see it is the latest.

## Push status
At 2026-10-06 12:29 GST: local `master` is 3 commits ahead of `origin/master` (`b80a9ed`, `8273103`, `183e61b`) plus this handoff update. Waiting for Steve to confirm the push.
