[[PROJECT_TRACKER|← Project Tracker]]

# Testing

**Status (2026-10-06):** automated unit tests for the core pure logic. 40 test files, **1125 tests, all passing, no `it.fails` left** (`npm test`); `tsc --noEmit`, `eslint .` and `npm run build` clean alongside.

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
**All 13 `it.fails` were fixed on 2026-10-06 and flipped to normal `it` tests; none remain.** The suite now has 1042 passing tests. Fixes (all under `src/lib/`):

- `parsers/generic-csv.ts` and `tenancy-parser.ts`: dates are validated as real calendar dates (`2026-02-30`, `31/04/2026`, month 13, `45-11-2025` are rejected).
- `parsers/sharesight.ts` and `parsers/saxo.ts`: the CSV path finds the real header row below an intro/title line.
- `banking/csv-profiles.ts`: error line numbers are physical file lines (falls back to the old numbering if a quoted field spans lines).
- `bank-csv.ts`: `parseAmount` reads European `1.234,56` and `12,5`; a lone comma followed by 3 digits (`1,234`) keeps the US thousands reading.
- `portfolio-performance.ts` and `amortization.ts`: month arithmetic clamps to the last day of the month (31 Mar minus 1M is 28 Feb; a loan starting 31 Jan gets 28 Feb first).
- `vehicle-depreciation.ts`: a manual rate below -100% gives 0, not `NaN`; `EV_MODEL` no longer matches Hyundai i30/i40.
- `companies.ts`: holding cycles (mutual or longer) no longer make entities vanish; the member closing the loop is shown top-level.

## Observations (not asserted as bugs)
- ~~Saxo/Sharesight `parseCellDate` day-early shift in timezones ahead of UTC~~ — **fixed**: both use `parsers/dates.ts#parseCellDateUtc` (calendar parts read explicitly; xlsx Date cells read via local components; ambiguous `03/05/2025` stays month-first). Regression tests run in UTC, Asia/Dubai, America/Los_Angeles and Pacific/Kiritimati by switching `process.env.TZ` at runtime.
- ~~Sharesight: an empty Brokerage cell becomes `0`~~ — **fixed**: blank/whitespace/null is `undefined` (unknown); a real `0`/`"0.00"` stays 0. Saxo and generic-csv have no equivalent default.
- ~~`bluebook-parser.ts` skips any line containing "ref", "vin" or "tel"~~ — **fixed**: whole-word skip labels only (VIN, chassis, engine, mileage, phone/tel/fax, plate, invoice no, ref/reference + number or identifier); a line that also has a value word is kept with just the identifier blanked.
- Expert panels and co-ownership: `buildExpertPanelsData` receives already pro-rata assets (`applyOwnershipFactors` -> `scaleAssetForOwner`), so it must not scale again; regression tests in `dashboard-expert.test.ts` pin half-share money and identical DPI/TVPI.
- `fx.ts` static fallback table is USD-anchored even for a non-USD base (conversions unaffected).
- 26 base translation keys (tier selector, bento header, sidebar collapse, CSV steps, data-grid labels) are missing from all seven overlay languages and fall back to English (98.3% coverage each). See [[Localization|Localization]].

## Related
- [[Deployment|Deployment]] — pre-deployment checks (`tsc`, `eslint`, build) now sit alongside `npm test`
- [[Codebase-Audits|Codebase Audits]]
