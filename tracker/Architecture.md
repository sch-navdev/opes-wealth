[[PROJECT_TRACKER|← Project Tracker]]

# Architecture

**Status:** Living reference — a quick-orientation summary for future sessions. Detail lives in the linked module notes; this page intentionally doesn't duplicate it.

## Stack
- **Next.js 16.3.5** (App Router, Turbopack, `src/` dir). Next.js 16 deprecated the `middleware.ts` file convention in favor of `proxy.ts` — this repo already uses `src/proxy.ts` (auto-renamed by `next dev`'s codemod); see [[Authentication-Security|Authentication & Security]].
- **TypeScript**, **Tailwind CSS v4** (CSS-first `@theme`), **shadcn/ui** (`new-york` style, `zinc` base, all customized to the project's own theme).
- **Supabase** (Postgres 17.6, project `lpaollycwokxejrihrap`, region `ap-south-1`) — auth (password + TOTP 2FA + Passkeys), Postgres with RLS, no Storage/Edge Functions in use (images are stored as base64/JSON in-row, not in Supabase Storage).
- **Vercel** — Git-connected to `origin/master`; every push auto-deploys to production (`opes-wealth.vercel.app`).

## Supabase Schema (live, verified directly against the database — not just the migration files)
**Important divergence**: `supabase/migrations/*.sql` are mostly marked "not yet applied" in [[Database-Schema|Database Schema]], but a direct schema query shows the live database already has nearly all of that structure — it was evidently applied by hand (e.g. via the SQL editor) rather than through tracked migrations, since Supabase's own migration history table is empty. The live schema below is ground truth; the migration files describe intent/history and don't necessarily match column-for-column (e.g. `assets.images` is `jsonb` live, but the `0006` migration file defines it as `text[]`).

- **`public.profiles`** (1 row) — `id` (uuid, PK, FK → `auth.users.id`), `first_name`, `last_name`, `default_currency` (default `'USD'`), `created_at`, `address_street`/`address_po_box`/`address_city`/`address_postal_code`/`address_landmark`/`address_country`, `phone_number`, `avatar_base64`.
- **`public.asset_categories`** (6 rows, reference data) — `id` (uuid, PK), `name`, `slug` (unique), `created_at`.
- **`public.assets`** (1 row — Manarat Living III) — `id` (uuid, PK), `profile_id` (FK → `profiles`), `category_id` (FK → `asset_categories`), `name`, `ticker_symbol` (nullable), `quantity` (default `1`), `current_value`, `currency` (default `'USD'`), `is_liability` (default `false`), `created_at`, `updated_at`, `metadata` (`jsonb`, default `{}` — category-specific data, see [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] for the Real Estate shape), `images` (`jsonb`, nullable, default `[]`).
- **`public.asset_history`** (4 rows) — `id` (uuid, PK), `asset_id` (FK → `assets`), `recorded_date`, `value`, `created_at`, `net_equity` (nullable), `source` (default `'manual'`).
- All four tables have RLS enabled, scoped to `auth.uid()` (directly or transitively); `asset_categories` is shared read-only reference data.

## Financial Formulas (`src/lib/real-estate.ts`, verified against current source)
- **`resolveRegistrationFee(metadata)`** = `registration_fee_amount` if set, else `notaryFees + adm_fee_amount` (legacy fallback for pre-consolidation assets).
- **Total Property Cost** — `calculateTotalCost(metadata, fallbackValue)` = `(contract_price ?? purchasePrice ?? fallbackValue) + resolveRegistrationFee(metadata) + agencyFees + renovationFees + furnishingFees`.
- **Cash Invested to Date** (off-plan only) — `calculateCashInvestedToDate(metadata)` = `paid_to_date + resolveRegistrationFee(metadata) + agencyFees + renovationFees + furnishingFees`.
- **Unrealized Gain** — `calculateUnrealizedGain(marketValuation, totalCost)` = `{ amount: marketValuation - totalCost, percent: totalCost !== 0 ? (amount / totalCost) * 100 : null }`.
- **Net ROI** — not a separate helper; it's `calculateUnrealizedGain(...).percent` surfaced under its own card label (same number, different name) in `asset-detail-view.tsx`.
- **Net Equity** (`add-asset-dialog.tsx`'s submit handler, and mirrored in `updateAssetValuation` in `dashboard/actions.ts`) = `marketValuation − (is_offplan ? outstanding_balance : 0) − (linked_loan.amount ?? 0)`. This is what's actually stored in `assets.current_value` for Real Estate — market valuation itself is preserved separately in `metadata.market_valuation`.
- **Total Area** — `calculateTotalArea(internalArea, terraceArea)` = `(internalArea ?? 0) + (terraceArea ?? 0)`.

## Theming (`next-themes` + Tailwind v4)
- `src/app/globals.css` defines raw color variables under `:root` (light) and `.dark` (dark), then a single `@theme inline` block maps each to the `--color-*` custom property Tailwind's utilities read (`bg-background`, `text-primary`, …). Radius (`--radius-lg/md/sm: 0px`) is theme-independent — sharp corners in both modes.
- `src/components/theme-provider.tsx` wraps `next-themes`' `ThemeProvider` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem`), mounted in `src/app/layout.tsx`. `src/components/theme-toggle.tsx` cycles Light → Dark → System in the header.
- Full detail: [[Design-System|Design System]].

## Localization (`src/lib/i18n.ts` + `src/context/language-context.tsx`)
- Custom `LanguageProvider`/`useLanguage()` (no external i18n library), `localStorage`-persisted. Applied to `asset-detail-view.tsx` and the dashboard chrome; forms/dialogs elsewhere are not yet translated. Full detail: [[Localization|Localization]].

## Dev-Only Mock Auth Bypass
- `src/utils/supabase/mock-auth.ts` — gated on `NODE_ENV === "development" && NEXT_PUBLIC_MOCK_AUTH === "true"` (both required). Uses a service-role Supabase client (bypasses RLS) to load `/dashboard` for a specific `MOCK_AUTH_USER_ID` without a real session/passkey ceremony. **Debugging aid, not a permanent feature** — see [[Authentication-Security|Authentication & Security]] for the full rationale and a reminder to remove it once no longer needed.


## AI Help Assistant & Bug Queue (2026-10-01)

- **Widget**: `components/help-chat-widget.tsx`, mounted in `app/dashboard/layout.tsx` — a floating, collapsible chat bottom-right on every dashboard page. Messages live in memory (they survive in-dashboard navigation, not a reload). Strings are in `lib/i18n.ts` (`help_*`, EN + FR).
- **Endpoint**: `POST /api/assistant` (`app/api/assistant/route.ts`). Requires a signed-in session that has finished MFA step-up, a best-effort per-user throttle (12/min per server instance), max 20 messages × 4,000 chars. Calls Claude via `@anthropic-ai/sdk` (default model `claude-sonnet-5-5`, override with `ASSISTANT_MODEL`; needs `ANTHROPIC_API_KEY`, otherwise 503 and the widget says it isn't set up). Product knowledge and rules live in `lib/assistant/knowledge.ts` (navigation, import flows, bank-connection status, how numbers are calculated) — keep it in step with the tracker; the model is told to say when it doesn't know. It can't see or change user data.
- **Screenshot capture**: the camera button renders the visible page to a JPEG in the browser with `html-to-image` (html2canvas fails on modern CSS colours), excluding the widget itself. **"Blur amounts in screenshots" is on by default** (blurs `.tabular-nums` while capturing — best effort); the user sees a preview and can remove it; it is attached to the next message only, sent to the AI provider and **never stored**. Capped ~2 MB, 15 s timeout.
- **Bug queue**: the model has one tool, `report_bug`, and is instructed to use it only for reproducible app faults with repro steps (not user error or not-yet-built features). `lib/assistant/bug-queue.ts` stores it in `bug_reports` (migration `0021`, [[Database-Schema|Database Schema]]), **consolidating** with a pending report of the same fingerprint (normalised title + page, digits ignored) by bumping `occurrences` and distinct reporters instead of making a duplicate. Only the AI's description is stored — no transcript, no screenshot.
- **Daily flush**: `vercel.json` runs `GET /api/cron/bug-reports` at 06:00 UTC; it requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this when `CRON_SECRET` is set). `flushBugReports()` pushes every pending report to GitHub Issues (`GITHUB_ISSUES_TOKEN` + `GITHUB_ISSUES_REPO`, labelled `bug`, `ai-reported`) or a JSON webhook (`BUG_REPORT_WEBHOOK_URL`), marking each `sent` only after its push succeeds; with neither configured it leaves the queue untouched (503). Reports are AI-assessed and unverified — treat them as leads.
- **Verified**: tsc/lint/build; widget opens, sends and shows the error state in the browser; `/api/assistant` returns 401 without a real session; bug-queue/flush code type-checks. **Not verified**: a real model reply (no `ANTHROPIC_API_KEY` locally), the screenshot capture (the preview tab was hidden, which stalls `requestAnimationFrame` — the 15 s timeout path was added because of that), the `bug_reports` DB path (`0021` unapplied) and the cron/GitHub push.

## Groq help chat (2026-10-08, replaces the widget's backend)
- **Endpoint:** `POST /api/chat` (`app/api/chat/route.ts`), AI SDK v7 (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`). `createOpenAI({ baseURL: AI_BASE_URL || "https://api.groq.com/openai/v1", apiKey: GROQ_API_KEY })`, model `provider.chat("llama-3.3-70b-versatile")` (`.chat()` because Groq implements Chat Completions, not the Responses API), `streamText` with the fixed Opes Wealth support system prompt, streamed with `createUIMessageStreamResponse`. Security gate first: no Supabase user, or MFA step-up pending, is a 401 before the body is read; no `GROQ_API_KEY` is 503; per-user throttle 12/min (per instance); only text parts, last 20 messages, 4,000 chars each.
- **Widget:** `components/help-chat-widget.tsx` now uses `useChat` (from `@ai-sdk/react`: in ai v7 there is no `ai/react` export) with a `DefaultChatTransport` to `/api/chat`; shows text as it streams; refusals map to the existing error messages. **Removed from the widget:** screenshot attach (a text-only model cannot read it), page/locale context and the `report_bug` tool. `/api/assistant` (Claude, bug queue, cron flush) is untouched but no longer called by the widget. New keys `help_chat_welcome`, `help_chat_privacy` (the old `help_welcome`, `help_privacy_note` mentioned screenshots and bug reports and are now unused).
- **Fix after first real use (2026-10-08):** Steve saw the generic error locally and on the deployed app. Locally the cause was the dev mock login (no Supabase session, so 401): the route now accepts `isMockAuthEnabled()` (hard-gated on NODE_ENV development). On the deployed app the cause is not known (Vercel runtime logs were not readable from here, 403): the route now logs provider failures (`chat upstream error <status>`) and sends the client a coded error (`upstream_<status>`); the widget shows distinct messages for an expired/MFA-pending session (`help_chat_err_auth`) and a provider refusal such as a bad key or model (`help_chat_err_provider`), rate limit and not-configured as before. A new test runs the real AI SDK against a local fake OpenAI-compatible server (the request body is the standard Chat Completions shape: model, max_tokens, messages, stream, stream_options), so the wiring is proven apart from Groq itself.
- **Verified:** 7 route tests (401 no session, 401 MFA pending, 503 no key, 400 malformed, prompt + model passed, trimming, throttle), 3 widget tests, gates. **Not verified:** a real Groq reply (no key set), the browser widget end to end. **Prompt accuracy:** the prompt text is the one Steve supplied verbatim; it says tiers switch "in Settings" (the switch is in the sidebar) and tax lots are Expert only (they show for every tier on an equity's Analysis tab). Needs `GROQ_API_KEY` in Vercel.

## Related
- [[Database-Schema|Database Schema]] — migration file history (see divergence note above)
- [[Real-Estate-Multi-Currency|Real Estate & Multi-Currency]] — the `RealEstateMetadata` shape these formulas operate on
- [[Design-System|Design System]] — full theme detail
- [[Authentication-Security|Authentication & Security]] — full auth/passkey/mock-auth detail
- [[Localization|Localization]] — full localization detail
