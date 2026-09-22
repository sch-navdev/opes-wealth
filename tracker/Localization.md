[[PROJECT_TRACKER|← Project Tracker]]

# Localization

**Status:** Partial — architecture built and applied to the asset details page + dashboard chrome; most forms/dialogs not yet wired.

## English/French Toggle

- **Trigger**: `asset-detail-view.tsx`'s three tab labels were hardcoded French (`Aperçu`/`Analyse`/`Paramètres`) while every other string in the app was already English — a leftover from an earlier task, not an intentional partial localization. Rather than just renaming the three strings, built a real toggle since the request asked for one.
- `src/lib/i18n.ts` — a plain `Record<key, {en, fr}>` dictionary (`translate(locale, key, vars?)`, with `{placeholder}` substitution for the handful of strings that interpolate a value, e.g. `converted_note`, `registration_fee`, `duration_months`, `net_equity_share`). No external i18n library — the app's total string surface didn't justify one.
- `src/context/language-context.tsx` — `LanguageProvider`/`useLanguage()`, same shape as [[Privacy-Mode|Privacy Mode]]'s `PrivacyProvider` (state + `localStorage` persistence under `opes_locale`, defaults to `"en"`). Mounted in the root `layout.tsx` (not just the dashboard layout) so `/login` and the marketing page can use it too, though neither is translated yet.
- `src/components/language-switcher.tsx` — a small `EN`/`FR` toggle button, dropped into `dashboard-header-controls.tsx` next to the Privacy toggle.
- `src/components/translated-text.tsx` — a `<T k="..." />` client component so Server Components (like `dashboard/page.tsx`) can render a translated string without becoming Client Components themselves; it renders nothing but the translated text via `useLanguage()` internally.

## What's translated
- `asset-detail-view.tsx` (the actual target of this task) — fully: header card, Refresh Valuation dialog, all three tabs (Overview/Analysis/Settings — the correct English forms of the three original French labels) and every card/label/status string inside them.
- `dashboard/page.tsx` + `dashboard-header-controls.tsx` — header chrome (Welcome back, Portfolio heading/subtitle, Profile Settings, Sign Out, Net Worth).

## What's NOT translated yet (flagged, not silently skipped)
`add-asset-dialog.tsx`, `real-estate-fields.tsx`, `profile-form.tsx`, `country-combobox.tsx`, `portfolio-table.tsx`, the settings/login/MFA pages. These are large forms (~2,000 combined lines) with no existing French content — translating them was out of scope for fixing the original 3-string leftover and would be a substantial follow-up task in its own right if the product actually needs full bilingual support, rather than just the asset details page.

## Related
- [[Privacy-Mode|Privacy Mode]] — the context/provider pattern this reuses
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — `asset-detail-view.tsx`, the file this task's tab labels came from
