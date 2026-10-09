[[PROJECT_TRACKER|← Project Tracker]]

# Personal Cash Flow

**Status:** Step 1 of 3 built 2026-10-09 (income tracker + calendar). Step 2 (cash-flow waterfall: income minus planned liabilities minus daily expenses from the statement parsers = net investable cash) and step 3 (emergency fund target of 3 to 6 months of essential expenses + planned liabilities, with a 10-20 % diversion rule until funded) are NOT started.

## Step 1 (2026-10-09)
- Steve's decisions: amounts entered NET; page `/dashboard/cash-flow`; frequencies monthly, quarterly, annual and one-off; streams PRIVATE to their owner (no co-owner sharing).
- **Migration `supabase/migrations/0037_income_streams.sql` is DRAFTED, NOT APPLIED (Steve must run it).** Table `income_streams` (kind, label, source, amount, currency, frequency, pay_day, pay_month, start/end date, notes), owner-only RLS, restrictive demo read-only policies like 0034. Until it is applied the page shows an empty list with a disabled Add button and a "not available yet" note; the dashboard calendar simply has no earned layer.
- `lib/income-streams.ts` (34 tests): validation codes (`cf_err_*`), monthly equivalent (quarterly / 3, annual / 12; one-off and ended streams count 0 there but are in the "next 12 months" total), expansion into dated occurrences (day 29-31 clamps to month end; quarterly uses `pay_month` as the first month; a one-off pays on the first matching date on or after the start date), FX through the existing helpers. `lib/income-streams-server.ts` loads streams (never throws). Actions `dashboard/income-stream-actions.ts`: session + MFA step-up, demo refused, every query scoped to `profile_id`.
- Page `dashboard/cash-flow/page.tsx`, `components/income-streams-manager.tsx`, `income-stream-dialog.tsx`: dense Chronograph table, add / edit / delete dialog (native selects), totals row. Sidebar and command palette entry (`cashFlowPage`, Professional and up).
- Income calendar: optional `streams` input adds `earned` / `earnedItems` per month WITHOUT touching the passive totals or yields; toggle "Include earned income", legend Salary / Bonus / Other earned. One extra sequential query in `dashboard/page.tsx`.
- 86 `cf_` keys (nine languages, machine-translated), including Salary, Bonus, Investable cash, Emergency fund for the later steps. See [[Localization|Localization]], [[Portfolio-Dashboard|Portfolio Dashboard]].
- **Not verified:** the migration, RLS and the insert / update / delete round trip against a real database; the page, dialog and calendar toggle in a browser, light theme, RTL, nine languages.
