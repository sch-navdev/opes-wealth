[[PROJECT_TRACKER|← Project Tracker]]

# Future Projects (simulations) & Bankability

**Status:** built, type-checked, linted and built (2026-10-02). **Migration `0031_future_projects.sql` is applied (verified live 2026-10-06). It had to be applied BEFORE the matching app version was deployed** (the app now filters every portfolio query on `status = 'active'`; without the column the dashboard would come back empty). The page itself has not been clicked through in a browser.

## What it does
- `/dashboard/planning` ("Future Projects" in the sidebar): plan an investment as an ordinary asset saved with `status = 'simulation'`. The existing Add/Edit asset dialog is reused with a `simulation` prop (it saves `status = simulation`, hides the co-owner section; `addAsset` only accepts `simulation` or `active`).
- Per project: Day D, maximum loan (% of price), interest rate, term, own cash (empty = the minimum the loan cap allows). Shows total cost (price plus fees), **cash needed on Day D**, **required borrowing**, the monthly repayment and three checks.
- A red alert lists why a plan is **not bankable**; a blue note says income is still needed; a green note says all checks pass.
- Dashboard widget `components/future-projects-card.tsx`: stacked bars (own cash vs borrowing) per project, totals, a "Not in net worth" badge, **Hide / Show** (remembered in this browser). It is the only place simulations appear on the main dashboard.

## Bankability engine (`lib/planning.ts`, pure)
1. **LTV:** borrowing must not exceed the maximum loan share of the PRICE (fees come from own cash).
2. **Liquidity:** cash on hand (Cash accounts, the user's share) minus the cash earlier projects use must cover the cash needed. Projects are evaluated in Day D order, so two projects compete for the same cash.
3. **Debt ratio:** existing monthly repayments (liability loans and property loans) plus the new repayments, over monthly income, must be at or under the limit (default 35%, editable). Without an income this check is "unknown": the verdict is "incomplete", not a failure.
- Price/fees: Real Estate = contract or purchase price plus acquisition fees; Vehicles = purchase price; others = value. A property's own linked-loan fields are ignored in favour of the plan inputs.
- Tested on sample figures (single project passes; a second project fails liquidity; own cash below the minimum fails LTV). It is a transparent rule of thumb, **not** a credit decision or financial advice; the page says so.

## "Simulations never touch net worth"
- Migration 0031 adds `assets.status` (check `active`/`simulation`, default `active`, so all existing rows stay live) and `assets.plan jsonb`. **Deviation from the brief:** the plan is its own column, not metadata, because the per-category forms rewrite `metadata` on every edit and would drop it.
- Filtered to `status = 'active'`: the dashboard assets query (`dashboard/page.tsx`), co-owned asset loader (`shared-assets/load.ts`, used by dashboard, Companies, planning), Excel export, Companies, Banking cash list, the equity price-refresh and the broker-import ticker lookup. Everything else works by asset id and cannot sweep simulations in. Only `lib/planning-data.ts` reads `simulation` rows.
- Asset detail pages by id still open a simulation (reached from the planning page).

## Limits
- Monthly income and the debt-ratio limit are typed on the planning page and kept in this browser's storage (not the database), so the widget and page share them per browser.
- No "convert to a real asset" button yet, and no loan-schedule or rate-stress view.
- Not verified against a live database or in a browser.

## Related
- [[Portfolio-Dashboard|Portfolio Dashboard]] — the widget and the filtered queries
- [[Database-Schema|Database Schema]] — migration 0031
- [[Co-Ownership|Co-Ownership]] — shared loaders now filter on status
