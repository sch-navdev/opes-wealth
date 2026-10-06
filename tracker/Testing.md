[[PROJECT_TRACKER|← Project Tracker]]

# Testing

**Status (2026-10-06):** automated unit tests added for the core pure logic. 35 test files, **1039 tests, all passing** (`npm test`); `tsc --noEmit`, `eslint .` and `npm run build` clean alongside.

## Setup
- **Runner:** Vitest `^5` (upgraded from 3 on 2026-10-06 together with `@types/node` `^22.0.0`; Node 24 locally). Config in `vitest.config.mts` (node environment, `@` alias to `src`, includes `src/**/*.test.ts`; `.mts` avoids a Vite native-config-loader warning).
- **Scripts:** `npm test` (single run), `npm run test:watch`.
- **Convention:** tests are colocated next to the source as `<name>.test.ts`. Only pure logic is tested: no network, no Supabase, no DOM. The one `vi.mock` is `@/lib/services/fx-client` in `fx.test.ts`.

## Coverage
- **Money and valuation** (13 files): `fx`, `amortization`, `ownership`, `vehicle-depreciation`, `invested-capital`, `precious-metals`, `equities`, `startups`, `private-equity`, `scpi`, `companies`, `passive-income`, `planning`.
- **Imports and parsing** (12 files): `transactions` (fingerprints), `bank-csv`, `parsers/saxo` (incl. in-memory xlsx), `parsers/sharesight`, `parsers/generic-csv`, `parsers/broker-registry`, `banking/csv-profiles`, `banking/institutions`, `tenancy-parser`, `bluebook-parser`, `property-document-parser`, `crypto` (crypto-asset metadata validation, not encryption).
- **Portfolio, real estate, vehicles, i18n** (10 files): `portfolio-performance`, `portfolio-export`, `real-estate`, `real-estate-analytics`, `vehicles`, `asset-history-sync` (fake Supabase client), `demo-mode`, `countries`, `stores/useUiTierStore` (only `tierRank`/levels/default), `translations`.
- **Not tested:** `assets/metals-valuation.ts` and `assets/watch-valuation.ts` (read secrets and call `fetch`), server actions, React components, the persisted Zustand store, the RLS/DB layer. There are still no browser or end-to-end tests.

## Known issues the tests document (`it.fails`)
Each is a test written for the *correct* behaviour that currently fails, so the suite stays green while the bug is recorded. When a bug is fixed, the `it.fails` flips to a failure: change it to a normal `it`. The source was **not** changed. Status of all 13: **open**.

- `parsers/generic-csv.ts:64-78`: date parser checks shape only; accepts `2026-02-30`, `31/04/2026`, month 13 (3 tests).
- `parsers/sharesight.ts:248-255` and `saxo.ts:435-449`: CSV path treats the first line as header, so an intro/title line makes the file unreadable (xlsx path is fine).
- `banking/csv-profiles.ts:626-627`: reported line number ignores dropped blank lines (reports 3, physical line is 4).
- `tenancy-parser.ts:12-22`: `normalizeDate` only range-checks the month (`45-11-2025` becomes `2025-11-45`).
- `bank-csv.ts:95-116`: `parseAmount` does not read European `1.234,56` (US format only; known limitation).
- `portfolio-performance.ts:363-364`: `rangeStartDate` 1M/6M overflows on month-ends (2025-03-31 gives 2025-03-03, expected 2025-02-28). `addMonthsIso` in the same file clamps correctly.
- `vehicle-depreciation.ts:99-100`: a manual rate below -100% gives `NaN` instead of 0.
- `vehicle-depreciation.ts:42`: `EV_MODEL` regex also matches Hyundai i30/i40 (petrol/diesel) and gives them the EV curve.
- `amortization.ts:45-49`: `addMonths` overflows on month-ends (loan starting 2025-01-31 gets first instalment 2025-03-03, expected 2025-02-28); feeds schedule dates and outstanding-principal.
- `companies.ts:142-153`: two entities naming each other as holding company both vanish from the structure (only self-reference is guarded).

## Observations (not asserted as bugs)
- Saxo/Sharesight `parseCellDate` uses `new Date(string)` then `toISOString()`: for non-ISO strings it reads month-first and can land a day early in timezones ahead of UTC (e.g. UAE). Depends on machine timezone.
- Sharesight: an empty Brokerage cell becomes `0` instead of `undefined`.
- `bluebook-parser.ts` skips any line containing "ref", "vin" or "tel" (drops "Reference value", "Preferred value").
- `fx.ts` static fallback table is USD-anchored even for a non-USD base (conversions unaffected).
- 26 base translation keys (tier selector, bento header, sidebar collapse, CSV steps, data-grid labels) are missing from all seven overlay languages and fall back to English (98.3% coverage each). See [[Localization|Localization]].

## Related
- [[Deployment|Deployment]] — pre-deployment checks (`tsc`, `eslint`, build) now sit alongside `npm test`
- [[Codebase-Audits|Codebase Audits]]
