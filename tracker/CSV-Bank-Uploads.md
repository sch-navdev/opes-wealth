[[PROJECT_TRACKER|← Project Tracker]]

# CSV Bank Uploads

**Status:** In progress — Phase 1, Step 8. Backend built; upload UI (dropzone) not yet built.

Scope (from the Phase 1 MVP definition): let a user import assets/transactions from a bank-exported CSV file, mapped onto the [[Database-Schema|assets/asset_history schema]]. Built backend-first, deliberately ahead of the upload UI, so a future dropzone component has something real to call.

## What's supported (v1 scope)
Only the common **running-balance** style bank export — one row per date, with a Balance column that already reflects the account total that day. This maps directly onto `asset_history(recorded_date, value)`, no new tables needed.

**Not supported yet**: a transactions-only export (Date, Description, Amount, no running Balance) — that needs a starting balance plus a cumulative sum to derive a balance per date, a real feature in its own right, not a variant of this one. Flagged clearly rather than silently mishandled.

## Backend (new)
- `src/lib/csv-parser.ts` — a minimal hand-rolled RFC 4180 CSV parser (no dependency added). Handles quoted fields with embedded commas/newlines/escaped `""` quotes, CRLF/LF, and a missing trailing newline. `parseCsv(text)` → `{ headers, rows: Record<string,string>[] }`.
- `src/lib/bank-csv.ts` — the domain layer:
  - `BankCsvColumnMapping = { dateColumn, balanceColumn, dateFormat }` — `dateFormat` is one of `"YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY"` and must be picked explicitly by whoever maps the columns (the future UI). Never auto-detected/guessed — a bank CSV's date format is ambiguous (`03/04/2026` is March 4th in the US convention, April 3rd in the UAE/EU one that this app's Real Estate data already uses), and guessing wrong would silently corrupt financial history.
  - Date parsing rejects invalid calendar dates (e.g. Feb 30th) rather than letting JS's `Date` roll them into the next month.
  - Amount parsing strips currency symbols/thousands separators and treats parenthesized amounts (`(123.45)`) as negative — the standard accounting-export convention for debits.
  - `parseBankCsvRows(rows, mapping)` returns `{ validRows, errors }` — every row either parses cleanly or produces a row-indexed error message (missing column, unparseable date/amount, or a duplicate date within the same file); nothing is silently dropped.
  - Verified with a disposable script (not committed) covering: quoted+escaped-quote fields, currency-formatted and parenthesized-negative amounts, MM/DD vs. DD/MM disambiguation on the same ambiguous input, an invalid calendar date, and duplicate-date detection — all behaved as intended.
- `src/lib/asset-history.ts` (new) — `AssetHistorySource` union (`"manual" | "dari" | "dubailand" | "csv_import"`), the app-level source of truth for what `asset_history.source` can be (the live column itself has **no CHECK constraint** — confirmed via `pg_constraint`/`information_schema.columns` — so this union exists to stop a typo from silently creating an unrecognized source value, not to satisfy a DB-level rule). `updateAssetValuation`'s `source` param now uses this same type instead of its own inline union.
- `src/app/dashboard/actions.ts` gained `importBankCsvHistory(assetId, rows: ParsedBankCsvRow[])` — verifies the asset belongs to the signed-in user, `upsert`s into `asset_history` with `onConflict: "asset_id,recorded_date"` (same re-import-regenerates-in-place pattern as `syncAssetHistory`'s Real Estate timeline), sets `net_equity = value` (correct for a Cash-style account with no debt to subtract, same simplification `syncAssetHistory` already makes for every non-Real-Estate category), and sets `assets.current_value` to whichever imported row has the latest `recorded_date` (a CSV need not be chronologically ordered). No migration needed (see above — `source` has no CHECK constraint to update).
- **Not yet built**: the upload UI itself (dropzone, column-mapping picker, a preview/confirm step showing `validRows`/`errors` before calling `importBankCsvHistory`). Next planned step — see the "21st.dev-Informed Polish" entry in [[Portfolio-Dashboard|Portfolio Dashboard]] for the dropzone component candidates already shortlisted from the 21st.dev catalog.
- `tsc --noEmit` and `eslint` both clean on every new/changed file.

## Related
- [[Database-Schema|Database Schema]] — target tables (`assets`, `asset_history`)
- [[Portfolio-Dashboard|Portfolio Dashboard]] — where imported assets will surface; also the 21st.dev dropzone candidates shortlisted for this feature's UI
