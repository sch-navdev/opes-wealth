[[PROJECT_TRACKER|← Project Tracker]]

# Emergency Fund and Cash-Flow Waterfall

Part of [[Personal-Cash-Flow|Personal Cash Flow]] (steps 2 and 3). Related: [[CSV-Bank-Uploads|CSV Bank Uploads]] (source of the transactions), [[Design-System|Design System]] (Chronograph panel).

**Status (2026-10-09):** built, unit and component tested; NOT checked in a browser, NOT run against real data.

## Formulas
- Net investable cash = (monthly net income - planned liabilities per month) - daily life expenses, all in the Base Currency.
- Income: monthly equivalents of the income streams (`lib/income-streams.ts`); one-offs are excluded from the run-rate and shown apart ("next 12 months").
- Planned liabilities: `monthly_payment` of liability assets plus the linked loan of Real Estate assets (same sources as `summariseHoldings`). Only the user's own assets (`profile_id`), no co-owner share scaling.
- Daily life expenses: average monthly outflow of `transactions` over the last N complete months (1-12, default 3), divided by the months that actually have transactions (so a missing month does not dilute the average).
- Emergency target = M x (monthly essential expenses + planned liabilities), M 3-6 (default 6). Current = balances of Cash accounts the user ticks, restricted to checking / savings / unset account types (term deposit and "other" never count). Savings rule: while current < target, divert pct (10-20, default 15) of net investable cash, capped at the remaining gap, never negative; funded = 100 % free to invest.

## Exclusion heuristics (all toggleable, one reason per line, first match wins)
1. Own transfers: pair = same booked date, same currency, exactly opposite amounts, two different accounts, each line used once (cross-currency legs are NOT paired). Text = explicit phrases only ("between my accounts", "virement interne", ...); a bare "transfer" is never enough.
2. Credit-card settlement: phrases such as "credit card payment", "paiement carte de credit", "card settlement" (a plain "card purchase" is an expense).
3. Liability payment: outflow within 10 % of a planned payment AND naming the lender / liability (word of 4+ letters), OR within 0.5 % AND carrying loan wording. An equal amount with no text is NOT excluded (avoids hiding a real expense).
Classification: keyword config `ESSENTIAL_KEYWORDS` in `lib/cash-flow-waterfall.ts` (EN / FR / Arabic transliteration and a few Arabic-script words); anything unmatched is discretionary; per-merchant override by a normalised merchant key. Without transactions the user types a monthly estimate and an essential share (default 60 %).

## Where things live
`lib/cash-flow-waterfall.ts` (pure), `lib/cash-flow-waterfall-server.ts` (loader, paged 1000 rows), `lib/cash-flow-settings-local.ts` (localStorage `opes-cash-flow-settings-v1` with in-memory fallback), `components/cash-flow-waterfall.tsx` (rendered from `dashboard/cash-flow/page.tsx`), texts `cfw_*` in `lib/cash-flow-waterfall-labels.ts` + `tmp-i18n-waterfall.json` (74 keys, nine languages, machine-translated, to be merged into i18n).
No migration: settings and the "emergency fund" account marks live in the browser (per device). The marks are also honoured when an account carries `metadata.purpose = "emergency_fund"` (read only; no UI writes it, because `updateAsset` rewrites the whole metadata from the form). If cross-device persistence is wanted, a `cash_flow_settings` table or profile column would be needed (not drafted).

## Guidance behind the 3-6 months range (commonly cited, NOT verified at source)
The commonly cited guidance from French savings guidance (Banque de France pages), UK MoneyHelper, the US CFPB and UAE sources is 3 to 6 months of essential expenses, 3 months being the usual minimum and 6 for single-income or variable-income households. **I did not verify each source's exact wording.** A WebSearch (standard mode) found only commercial and educational pages (Finary, Invesse, CIBC, Freenance) that agree on 3-6 months (about 3 for salaried, up to 6 for self-employed); it did not return the Banque de France, MoneyHelper, CFPB or UAE pages themselves. Check those sites directly before quoting them. The UI states only "commonly cited guidance is 3 to 6 months", informational, not advice.

## Not verified
Browser rendering (light / dark, RTL, nine languages, narrow screens), the scrub readout with a real pointer, the loader against the real database, the heuristics on real statements (only invented fixtures were used).
