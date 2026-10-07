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

## Retirement passive income simulator (2026-10-07)

A second section on `/dashboard/planning`, below the board: "how much must I save per month to reach a target net passive income at retirement, given what I already have". An illustration with the user's own assumptions, **not advice and not a forecast**. Not registered in the dashboard layout registry; it lives on this page only (the page itself is not tier-gated, the sidebar link is: see [[Design-System|Design System]], progressive UI tiers). Layout and motion follow the same design tokens and tier motion helper (`useTierMotion`, `tileEntranceStyle`); sliders + clean cards + bento result grid were taken as 21st.dev *patterns* and re-implemented (no imports, no `get_component` quota spent).

**Files.** `lib/retirement.ts` (pure maths, `retirement.test.ts`), `lib/retirement-assets.ts` (starting assets, `retirement-assets.test.ts`), `components/retirement-simulator.tsx` (`retirement-simulator.test.tsx`), `components/retirement-text.ts` + `lib/retirement-labels.ts` (typed `ret_*` text with an English fallback until the keys in `.tmp-ret-keys.json` are merged into `lib/i18n.ts` / `lib/translations/*`), wiring in `app/dashboard/planning/page.tsx`.

**Maths** (effective annual rates; monthly m = (1+r)^(1/12) - 1; deposits at the END of each month, same as `solveSavingsPlan` / `projectFinalCapital` in `lib/irr.ts`):
- years n = retirement age - current age, months N = round(n * 12), horizon used = N / 12.
- income at retirement (nominal) = desired monthly income * (1 + inflation)^n.
- method **withdrawal rate** (default 4 %): target capital = income at retirement * 12 / rate. Method **returns only** (capital untouched, income = r * capital): target = income at retirement * 12 / r (blocked at r <= 0).
- assets grown = A * (1 + r)^n; gap = max(0, target - grown); required monthly saving = gap * m / ((1+m)^N - 1) (gap / N when r = 0). Gap <= 0 gives saving 0 and an "on track" state with the projected surplus.
- Worked examples (40 to 60, 3,000/month, r 5 %, A 200,000): inflation 0 + 4 % rule = target 900,000, saving about 910; inflation 0 + returns only = target 720,000, saving about 467; inflation 2 % + 4 % rule = income 4,458, target about 1,337,353, saving about 1,988. Tests also feed the saving back into `projectFinalCapital` and require the target within a cent, plus r = 0, negative r (library only), A = 0, NaN/huge inputs, age order.
- `sensitivity()`: required saving at r - 1 pt, r, r + 1 pt (inflation unchanged) and at inflation 0 / 2 / 3 % (return unchanged); tested for monotonicity.

**Inputs and defaults.** Current age 40, retirement age 65, desired net monthly income 3,000 (display currency, today's money), return 5 % (slider 0-12 %, field 0-20 %; negative blocked), inflation 2 % (0 allowed), withdrawal rate 4 %, optional "current monthly saving" (shows "X more/less per month than the saving entered" only when filled). Sliders are native `<input type="range">` styled with `accent-primary`, each paired with a numeric field and an `aria-valuetext`; `radix-ui` does ship a Slider, but the native control is touch-friendly and testable in jsdom. Inputs (as text, so a half-typed number survives) are remembered in `localStorage` key `ow_retirement_inputs` (try/catch, via `useStored`). `profiles` has no birth date or age column (grep of `src` and `supabase/migrations`), so age is a plain input, not read from the profile.

**Starting assets** ("current investable net assets"), computed server-side in the page from the already-loaded, share-scaled holdings and the same FX rates (no new network calls) and passed per category. The app does not mark a primary residence, so the user switches categories in/out (checkboxes in the Assumptions disclosure). Default ON: Cash, Equities, Crypto, Precious Metals, SCPI, Assurance-Vie. Default OFF: Real Estate (counted at its equity = value minus its own linked loan when included), Private Equity, Companies, Startups, Vehicles, Exotic Assets. Standalone liabilities are not subtracted (kept simple). A typed "own figure" replaces the total.

**Outputs.** Hero required saving, target capital, current assets at retirement, gap, time to retirement, income at retirement (nominal, with today's-money equivalent), the sensitivity table, a stacked bar of what the target is made of (current assets, their growth, savings paid in, their growth) with a text alternative, a plain-words assumptions summary, and the limits note. A polite `role="status"` live region announces the result; validation messages use `role="alert"` and `aria-invalid`. Money values go through `maskValue`, so privacy mode masks them (also in the live region and the chart label).

**Deliberately out of scope:** tax on withdrawals (the income is treated as net), per-asset returns, Monte Carlo / sequence-of-returns risk, pensions and state benefits, drawdown of capital over a fixed horizon, linking liabilities to specific assets.

**Verified:** vitest on the three new test files; `tsc --noEmit` and `eslint` on the touched files; in the dev browser pane the section rendered with mock-auth data, inputs updated the result (40 to 60 at defaults gave target 1,337,353, matching the worked example), the Assumptions disclosure opened, and at 375 px there was no horizontal overflow. **Not verified:** screen-reader behaviour, light theme, privacy toggle in the browser (covered by jsdom only), non-English languages (keys not merged yet).

## Related
- [[Portfolio-Dashboard|Portfolio Dashboard]] — the widget and the filtered queries; the simulator reuses its share scaling and FX approach
- [[Design-System|Design System]] — tokens, tier motion and the sidebar tier gating used by the simulator
- [[Database-Schema|Database Schema]] — migration 0031
- [[Co-Ownership|Co-Ownership]] — shared loaders now filter on status
