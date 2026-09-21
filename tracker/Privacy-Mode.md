[[PROJECT_TRACKER|← Project Tracker]]

# Privacy Mode

**Status:** Done — global "shoulder surfing" mode masking financial figures across the dashboard and asset details page.

## Context & State

- `src/context/privacy-context.tsx` — a client-side React context (`PrivacyProvider`, `usePrivacy()`). State: `isPrivate: boolean` (default `false`), persisted to `localStorage` under `opes_privacy_mode` (read on mount in a `useEffect`, written on every `togglePrivacy()` call; both wrapped in `try/catch` since `localStorage` can throw in private-browsing contexts — the app just stays visible in that case rather than erroring).
- `maskValue(value: string | number): string` — returns the literal `••••••••` when `isPrivate` is true, otherwise `String(value)`. Callers are expected to format the value themselves first (e.g. `maskValue(currencyFormatter.format(x))`) — `maskValue` itself doesn't know about currency or number formatting, it's a pure visibility gate.
- `src/app/dashboard/layout.tsx` — new file (none existed before). Wraps `children` in `<PrivacyProvider>`, so the toggle state is shared across `/dashboard`, `/dashboard/assets/[id]`, and `/dashboard/settings` for the lifetime of a client-side navigation session (not just within one page).

## Toggle & Masked Surfaces

- `src/components/privacy-toggle-button.tsx` — a small reusable button rendering `Eye`/`EyeOff` (lucide-react), used in two places: the dashboard header (via `dashboard-header-controls.tsx`, below) and the asset details page header (directly in `asset-detail-view.tsx`, next to the Refresh Valuation button).
- `src/components/dashboard-header-controls.tsx` — new client component for `dashboard/page.tsx`'s header (which is itself a Server Component and can't call `usePrivacy()` directly): shows a "Net Worth" figure (see below) and the toggle button together, top-right.
- **`dashboard/page.tsx`** — now computes `totalNetWorth` (sum of every asset's converted value in the display currency, liabilities subtracted) and passes the formatted string into `DashboardHeaderControls` for masking. The portfolio table itself (Value column, the off-plan `Total: … | Owed: …` subtitle) was extracted into a new client component, `src/components/portfolio-table.tsx`, since masking those cells requires `usePrivacy()` and the page itself is a Server Component. `portfolio-table.tsx` is otherwise a straight lift of the previous inline `<Table>` JSX — same per-row logic, same `AddAssetDialog`/`DeleteAssetButton` usage.
- **`asset-detail-view.tsx`** (already a Client Component) calls `usePrivacy()` directly — no extraction needed. Masked: the header Net Equity figure; the Aperçu tab's chart Y-axis ticks and tooltip values, Total Property Cost, Unrealized Gain amount, Cash Invested to Date / Value per m²; the Analyse tab's Price/m², Estimated Market Value, Gross Share value, Net Share value + the equity-ratio percentage shown alongside it, the active loan balance, and every payment-milestone amount; the Paramètres tab's Contract/Purchase Price, ADM/Notary/Agency/Renovation/Furnishing Fees, and the loan Principal.
- **Left unmasked, deliberately**: category/condition/address text, the Unrealized Gain %-badge on the Aperçu tab, ownership %, EPC rating, loan interest rate/duration/start date, and milestone due dates/status — none of these are "financial figures" in the sense the request meant (a %, a date, or a category name doesn't reveal a dollar amount), and masking them would make the page far less legible for zero privacy benefit. The one percentage that *is* masked — the equity ratio shown next to Net Equity Share — was called out explicitly in the request ("Net Share value **and percentage**"), so that one instance is masked even though other percentages nearby aren't.
- Chart curves themselves are not masked (only the axis labels and tooltip text) — blanking the actual line shapes wasn't requested and would make the chart pointless while toggled; the numbers next to it are what's sensitive.

## Verification

Verified via a disposable preview route wrapping all three surfaces (dashboard header controls, portfolio table, asset details view) in one shared `PrivacyProvider`: toggling the button in either location masked every listed value simultaneously (confirming the shared context works across the component split), and toggling back restored all real figures. Not yet verified against a live Supabase instance, and the `localStorage` persistence itself wasn't exercised across a real page reload in this environment (only the in-memory toggle was verified).

## Related
- [[Portfolio-Dashboard|Portfolio Dashboard]] — the dashboard header and portfolio table this feature wraps
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — the asset details page's Aperçu/Analyse/Paramètres tabs this feature masks
