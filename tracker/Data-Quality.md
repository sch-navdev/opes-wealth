[[PROJECT_TRACKER|← Project Tracker]]

# Data Quality

**Status:** Built 2026-10-08 (OW11, Phase 2 module 1). Tests green; the page and card checked in the dev browser against real data (5 low-severity findings, all plausible); not checked at 375 px, in RTL or in light theme.

A reporting aid that flags data which can silently make totals or performance wrong. It never changes data and uses no advice wording. Origin: the gap analysis found that `convertAmount` converts a currency missing from the rate table 1:1 with no warning, and nothing flagged stale valuations.

## What is checked (`src/lib/data-quality.ts`, one `DATA_QUALITY_CONFIG`)
- `fx_missing` (high): an asset currency or the base currency has no usable rate. `fx_fallback` (medium): live rates unavailable, static approximate table in use (only reported when something is converted).
- `stale_valuation`: days since the last valuation vs a per-category threshold: Equities, Crypto, Precious Metals 7; Cash 45; Private Equity and SCPI 180; everything else 365; medium above 2x the threshold. Last valuation = newest of the history date and the category's own metadata date (`last_priced_at`, `valuation_date`, Blue Book log, `nav_date`, funding rounds). `no_valuation_date` when none. Liabilities and closed equity positions are skipped.
- `missing_cost_basis` (Real Estate, Vehicles, open Equities without buy trades), `cash_balance_mismatch` (vs latest history row, tolerance max(1, 0.5%)), `zero_value`, `pe_overdue_call` (pending capital call past its due date), `duplicate_suspect` (same normalised name, category, currency, plus account/wallet identifier where one exists).
- `lib/fx.ts` gained `getExchangeRatesWithStatus` (`live | mock | fallback`); `getExchangeRatesFromUsd` is unchanged.

## UI
- Dashboard block `dataQuality` (Standard and up, after the metric cards, default size M, `components/data-quality-card.tsx`): status line, up to 3 issues, link to the full page. Registered in `lib/dashboard-layout.ts` / `dashboard-tiers.ts`; saved layouts get it appended.
- Page `/dashboard/data-quality` (`app/dashboard/data-quality/page.tsx`, `lib/data-quality-load.ts`, `components/data-quality-list.tsx`): grouped by severity, filter chips, "How to fix" hint and an Open asset link per row. Sidebar link `dataQuality` (min Standard).
- 56 keys (`dq_*`, `nav_data_quality`, `dlayout_block_dataQuality`) in nine languages, machine-translated.

## Caveats
Thresholds are judgement calls and live in one config object. Cash mismatch uses the latest history row, which is only as current as the last import. Related: [[Portfolio-Dashboard|Portfolio Dashboard]], [[Localization|Localization]], [[Testing|Testing]].
