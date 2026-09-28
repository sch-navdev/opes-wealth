[[PROJECT_TRACKER|← Project Tracker]]

# CSV Bank Uploads

**Status:** Complete — Phase 1, Step 8. Backend and upload UI both built and verified (light + dark, EN/FR).

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
- `tsc --noEmit` and `eslint` both clean on every new/changed file.

## Upload UI (new)
- `src/components/csv-import-dialog.tsx` (new, client component) — `CsvImportDialog({ assetId })`, mounted on the asset detail page's Settings tab (`src/components/asset-detail-view.tsx`, next to the existing Edit/Delete asset actions) since `importBankCsvHistory` is scoped to one asset, not the whole portfolio.
  - **Dropzone stage**: drag-and-drop + click-to-browse (hidden `<input type="file" accept=".csv">`), rejects anything without a `.csv` extension (checked on both the drag-drop path and the file-picker path, since the `accept` attribute doesn't constrain drag-drop) and rejects a CSV with zero data rows — both with a localized inline error, nothing thrown to the console.
  - **Column-mapping stage**: reads the file client-side with `file.text()` + the existing `parseCsv` (`src/lib/csv-parser.ts`), then renders a `Select` per column (`dateColumn`, `balanceColumn`) populated from the CSV's actual header row, plus a `dateFormat` select (`YYYY-MM-DD` / `MM/DD/YYYY` / `DD/MM/YYYY` — never guessed, per this note's existing rule). Column selects are pre-filled with a best-effort guess (header name containing `"date"` / `"balance"`), always overridable.
  - Row validity (`validRows`/`errors` from `parseBankCsvRows`) is recomputed live via `useMemo` as the mapping changes, showing a "N rows detected" / "N rows will be skipped" preview before the user commits — matches this note's "nothing silently dropped" principle by surfacing the skip count instead of hiding it.
  - On confirm, calls `importBankCsvHistory(assetId, validRows)` inside a `useTransition`, surfaces `result.error` inline (verified live: a session without a valid Supabase auth cookie correctly surfaces "You must be signed in to import bank history." from the server action — expected under this environment's dev mock-auth, not a UI bug), otherwise shows a success stage with the imported count.
  - Styling: semantic Tailwind tokens only (`bg-card`, `text-foreground`, `border-border`, `bg-muted/30`, `text-destructive`, `text-success` — no hardcoded hex), reusing [[Portfolio-Dashboard|`portfolio-table.tsx`]]'s staggered-entrance pattern (`animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none` with an incrementing `animationDelay`) for the mapping fields as they appear.
  - Verified live in the browser (dev server, mock-auth session): dropzone accepts a real drag-dropped CSV, auto-guesses `Date`/`Balance` columns from a 3-row test file, live preview updates to match, rejects a `.txt` drop with the correct localized message, and renders correctly in both light and dark theme (toggled via the app's own theme toggle) and in French (the session's active locale) — see [[Localization|Localization]] for the new keys.
- Also completed as part of this pass: audited the codebase for hardcoded/inconsistent site URLs (`src/app/auth/actions.ts`'s `getSiteURL()` is the only place any absolute URL is built, already reads `NEXT_PUBLIC_SITE_URL` with a sane fallback — nothing else needed fixing). **Reminder still outstanding**: `NEXT_PUBLIC_SITE_URL` must be set manually in the Vercel dashboard before the next deployment (tracked since the prior auth pass — see [[Authentication-Security|Authentication & Security]]).

## Related
- [[Database-Schema|Database Schema]] — target tables (`assets`, `asset_history`)
- [[Portfolio-Dashboard|Portfolio Dashboard]] — where imported history now surfaces (asset's valuation chart/table)
- [[Localization|Localization]] — new EN/FR keys for the dropzone + mapping UI
- [[Deployment|Deployment]] — `NEXT_PUBLIC_SITE_URL` still needs setting in Vercel before next deploy
