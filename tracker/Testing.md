[[PROJECT_TRACKER|← Project Tracker]]

# Testing

**Status (2026-10-10): 209 test files / 3022 tests, all passing; `eslint .` and `npm run build` green (counts below this line are from 2026-10-06).** Earlier status: automated tests for the core pure logic, the co-owner approval flow and requester notifications (mocked two-user simulation) and React component tests. 88 test files, **1626 tests, all passing, no `it.fails` left** (`npm test` runs both Vitest projects); `tsc --noEmit`, `eslint .` and `npm run build` clean alongside.

## Setup
- **Runner:** Vitest `^5` (upgraded from 3 on 2026-10-06 together with `@types/node` `^22.0.0`; Node 24 locally). Config in `vitest.config.mts` (node environment, `@` alias to `src`, includes `src/**/*.test.ts`; `.mts` avoids a Vite native-config-loader warning).
- **Projects:** `vitest.config.mts` defines two projects via `test.projects` (each `extends: true`, so the `@` alias is shared): `unit` (node env, `src/**/*.test.ts`, unchanged and fast) and `components` (jsdom env, `src/**/*.test.tsx`, `setupFiles: src/test/setup-dom.ts`). `npm test` runs both.
- **Component stack:** jsdom + `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom` (matchers via `@testing-library/jest-dom/vitest` in the setup file, which also runs RTL `cleanup()` after each test; type augmentation comes from that import, so no tsconfig change was needed).
- **Scripts:** `npm test` (single run), `npm run test:watch`.
- **Convention:** tests are colocated next to the source as `<name>.test.ts` (pure logic: no network, no Supabase, no DOM; the one `vi.mock` is `@/lib/services/fx-client` in `fx.test.ts`) or `<name>.test.tsx` (components, jsdom).
- **Writing a component test:** name it `src/components/<name>.test.tsx`; render with RTL and query by role/name (`getByRole`), drive with `userEvent.setup()`, assert with jest-dom (`toBeChecked`, `toHaveFocus`). Wrap in the real `LanguageProvider` so English strings render (it defaults to `en`); do not mock the unit under test. The UI-tier store is created with `skipHydration` and zustand persist cannot reset its hydrated flag, so use `loadTierModules()` from `src/test/tier-test-utils.ts` in `beforeEach` (clears localStorage and the cookie, `vi.resetModules()`, re-imports store/components fresh, then call `rehydrate()` inside `act` like `app-sidebar.tsx`). Use the returned modules, not static imports of those files.

## Coverage
- **Money and valuation** (13 files): `fx`, `amortization`, `ownership`, `vehicle-depreciation`, `invested-capital`, `precious-metals`, `equities`, `startups`, `private-equity`, `scpi`, `companies`, `passive-income`, `planning`.
- **Imports and parsing** (12 files): `transactions` (fingerprints), `bank-csv`, `parsers/saxo` (incl. in-memory xlsx), `parsers/sharesight`, `parsers/generic-csv`, `parsers/broker-registry`, `banking/csv-profiles`, `banking/institutions`, `tenancy-parser`, `bluebook-parser`, `property-document-parser`, `crypto` (crypto-asset metadata validation, not encryption).
- **Portfolio, real estate, vehicles, i18n** (10 files): `portfolio-performance`, `portfolio-export`, `real-estate`, `real-estate-analytics`, `vehicles`, `asset-history-sync` (fake Supabase client), `demo-mode`, `countries`, `stores/useUiTierStore` (only `tierRank`/levels/default), `translations`.
- **Components** (2 files, jsdom): `components/tier-gate.test.tsx` (`TierGate` per real `SECTION_TIERS`, `useUiTier` before/after hydration and with/without `TierProvider`, `useTierMotion`) and `components/ui-tier-preference.test.tsx` (radiogroup with 4 radios, default Basic, click selects + updates store + writes the `opes-ui-tier` cookie + polite live-region message, arrow/Home/End keys with wrap and focus, roving tabindex).
- **Not tested:** `assets/metals-valuation.ts` and `assets/watch-valuation.ts` (read secrets and call `fetch`), server actions, every React component other than the two above (tier gate, UI tier preference), the RLS/DB layer. There are still no browser or end-to-end tests.

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
- ~~26 base translation keys missing from the seven overlay languages~~ **Fixed 2026-10-06:** the gap had grown to 98 keys per language (tier selector, preferences, bento, CSV card, grid columns, Basic overview, Expert panels, sparklines); all 98 were translated into ar, de, es, hi, it, ru and zh and every overlay language is now at 100%. The new `translates every base key (100% coverage)` test in `translations.test.ts` keeps it there. See [[Localization|Localization]].

## Additions 2026-10-06 (now 88 files / 1626 tests)
- New areas: bank-PDF parsers per bank (FAB, Wio, Banque Populaire) on synthetic fixtures plus `classify`/`index`/`bridge`, `csv-dropzone`, `command-menu`, `portfolio-table` and `portfolio-groups`, transaction sheet and list, income calendar, attribution (lib, card, panel) and `fx-history`.
- The **real-statement validation** (280 real bank statements) was run locally and is **not part of the repo suite**: no real statements or personal data are committed. Gate at 18:53 GST: `tsc`, `eslint`, `npm run build` clean.

- Encrypted PDFs and OCR (gate ~19:25 GST: 88 files / 1626 tests): `pdf-text` with an encrypted PDF generated by jsPDF (required/incorrect/correct password), `bank-pdf-actions` (routing, consent, size cap), the password prompt component, the OCR client with an injected `send` (no live AWS calls), the Textract block adapter, the OCR statement parser (synthetic OCR documents), and an OCR prompt/dialog smoke test. No real Textract output was ever tested.

## Related
- [[Deployment|Deployment]] — pre-deployment checks (`tsc`, `eslint`, build) now sit alongside `npm test`
- [[Codebase-Audits|Codebase Audits]]
