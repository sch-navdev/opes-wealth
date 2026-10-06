# Overnight Report — Progressive UI Tiers (2026-10-04)

Branch: `feature/ui-tiers` (pushed to origin and merged into `master`; checks re-run clean on 2026-10-06: `tsc`, `eslint`, `next build`. The tier selector itself still has no browser check.)

## Added
- `src/stores/useUiTierStore.ts` — Zustand store with `user_expertise_level` (`basic | standard | professional | expert`, default `standard`), `setExpertiseLevel`, `tierRank`. Persisted to localStorage (`opes-ui-tier`) with `skipHydration`.
- `zustand` dependency (package.json / package-lock.json).
- `tier_*` translation keys (EN/FR) in `src/lib/i18n.ts`.
- Tier selector in `src/components/app-sidebar.tsx` (desktop rail and mobile drawer).

## Modified
- `src/components/app-sidebar.tsx` — each nav link has a `minTier`; links render when `tierRank(minTier) <= tierRank(level)`.

## State logic
| Link | Shown from |
|---|---|
| Dashboard, Settings, Security | basic |
| Banking | standard |
| Companies | professional |
| Planning | expert |

Higher tiers keep everything lower tiers show. This is a UI preference only, not access control: routes remain reachable by URL.

## Deleted
- `src/components/ui/slider.tsx` (unused).
- Scan found no other orphaned components, old nav components, or unused locals/imports (`tsc --noUnusedLocals`).

## 21st.dev sidebar
Not installed. MCP search returned "Animated Sidebar", but it depends on `motion` and two helper files the MCP did not return, and the CLI install needs `API_KEY_21ST` (unset). The existing responsive sidebar (full at `lg+`, rail at `md`, drawer below) was kept.

## Guardrails
No changes to passkey logic, AAL2 session guards, or Supabase schemas. No loading-speed optimizations.

## Not verified
- `eslint` and full `tsc` cannot run in this environment (`node_modules` lacks `zod/v4/index.cjs` and `lucide-react` types).
- No browser check of the tier selector.

## Email
`RESEND_API_KEY` is not set in this environment, so this report was not emailed.
