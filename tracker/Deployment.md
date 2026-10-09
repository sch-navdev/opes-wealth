[[PROJECT_TRACKER|← Project Tracker]]

# Deployment

**Status (updated 2026-10-06):** Step 10 is complete — production is live at www.opeswealth.app (Vercel project `opes-wealth`, Supabase project `lpaollycwokxejrihrap`). The sections below that describe the deployment as "not done" are the original 2026-09-30 notes and are kept as history.

**Re-verified 2026-10-06 after the EC2 sessions (HEAD `017fe21`, local machine):** `npm install` was needed first (`zustand`, added on EC2, was missing from local `node_modules`; the lockfile did not change). Then `tsc --noEmit` exit 0, `eslint .` exit 0, `npm run build` exit 0 (Next.js 16.3.5 Turbopack, 21 routes). The build warns that `NEXT_PUBLIC_SITE_URL` is not set in the local environment (expected locally; confirm it in Vercel). Open manual items carried from 2026-10-02: Vercel Function Region should be Mumbai (bom1), invite emails landing in Hotmail junk (DMARC `p=none` without `rua`, no MX on the root domain), demo re-seed.

Scope: deploy to Vercel. `.env.local` currently holds the Supabase URL/anon key locally (gitignored) — production env vars, the Supabase project's production credentials, and any still-unapplied migrations under `supabase/migrations/` (see [[Database-Schema|Database Schema]]) all need to be sorted before/at this step.

## Pre-deployment hardening (this session)
- **`tsc --noEmit` and `eslint .` are now both fully clean** — zero errors, zero warnings, across the whole project (previously: four known lint failures in `carousel.tsx`/`language-context.tsx`/`privacy-context.tsx`/`mfa.ts`, plus two more `next lint` turned up in the same pass — `setup-2fa-form.tsx` and `theme-toggle.tsx` — and two pre-existing warnings, all now resolved):
  - `mfa.ts` — a real fix: the `any`-typed callback parameter was unnecessary (TS already infers it from context); the follow-on `currentAuthenticationMethods` type error this exposed was fixed by handling its `string | AMREntry` union explicitly, matching the pattern already used a few lines below for `amr`.
  - `language-context.tsx` / `privacy-context.tsx` — real fixes: both rewritten from `useState` + a mount-time `useEffect` reading `localStorage` to `useSyncExternalStore`, which is the textbook-correct primitive for syncing React state with an external, mutable source (no SSR/hydration behavior change — same default-then-sync-after-mount shape as before, just without a synchronous `setState` call inside an effect body).
  - `theme-toggle.tsx` — same real fix: the `mounted` hydration-safety flag (next-themes' own documented pattern) rewritten via `useSyncExternalStore` with a snapshot that's always `false` on the server and `true` on the client — eliminates the extra effect-driven render entirely rather than just silencing the warning.
  - `carousel.tsx` (vendored shadcn/embla primitive) — a scoped, justified `eslint-disable` instead of a rewrite: the flagged line is embla-carousel-react's own documented integration pattern (syncing from an imperative third-party API via `api.on(...)`), and hand-rewriting vendored/third-party-authored code via `useSyncExternalStore` for a lint-only concern was judged not worth the regression risk to the working image-carousel feature.
  - `setup-2fa-form.tsx` — a scoped, justified `eslint-disable`: `isFactorsLoading` already defaults to `true`, so the flagged `setIsFactorsLoading(true)` inside the mount effect's `loadActiveFactors()` call is a same-value no-op there (React bails out of re-rendering) — the linter just can't prove that statically, since the same function is also called from event handlers elsewhere where a fresh `true` is meaningful. Left the MFA setup flow's logic completely untouched given its security sensitivity.
  - `login-form.tsx` — a scoped, justified `eslint-disable`: `window.location.href` (not `router.push()`) after passkey sign-in is deliberate, not an oversight — that path sets the session cookie client-side with no server `redirect()` involved, so a hard reload is needed to guarantee the dashboard's server components read the fresh cookie rather than racing Next's RSC cache. Left this auth-critical path's behavior unchanged.
  - `asset-detail-view.tsx`'s image-carousel `<img>` warning — a real fix, not a suppression: swapped for `next/image` with `fill` + `unoptimized` (the images are already client-resized base64 data URIs from `resizeImageToBase64`, so there's no remote asset for the optimizer to fetch/transform — `unoptimized` just skips that no-op work while still getting `next/image`'s layout-shift handling).
  - Verified all four touched interactive behaviors live in-browser after the fixes: language toggle (EN⇄FR), theme toggle (dark⇄light), privacy-mask toggle, and the asset-detail image carousel (opened a real multi-image dialog, confirmed it renders and paginates) — no regressions, no new console errors beyond the browser pane's own benign HMR-websocket noise.
- **`npm run build` (production build, Turbopack) succeeds with zero errors** — all 11 routes compile, typecheck, and generate cleanly (`/`, `/login`, `/login/mfa`, `/dashboard`, `/dashboard/assets/[id]`, `/dashboard/settings`, `/dashboard/mfa`, `/reset-password`, `/auth/callback`, plus `/_not-found` and the root proxy/middleware).

## What's still actually needed before/at deployment (not done this session)
- ~~**The Vercel deployment itself.**~~ — **Done** (production is live; see the status note at the top). Original 2026-09-30 note: nothing was deployed that session because it needed Steve's explicit go-ahead.
- **`NEXT_PUBLIC_SITE_URL`** must be set manually in the Vercel dashboard before the first production deploy — flagged repeatedly since the auth-email-links work (see [[Authentication-Security|Authentication & Security]]); `src/app/auth/actions.ts`'s `getSiteURL()` falls back to the real production domain when this is unset and `VERCEL_URL` is present, but setting it explicitly is still the intended final state.
- ~~**`FINNHUB_API_KEY`** Supabase secret~~ — **Complete (2026-09-30)**: set via the Supabase CLI (now installed and linked to the project); `refresh-market-price` (v5) and `adrec-pricing` (v2) are deployed and ACTIVE. See [[Live-Pricing|Live Pricing]] and [[Market-Data-Integration|Market Data Integration]].
- Production Supabase credentials/env vars in Vercel, and confirming every migration under `supabase/migrations/` (through `0010`) is applied to whichever Supabase project the production deployment points at.

## Environment Hardening: `NEXT_PUBLIC_SITE_URL` (2026-09-30)

- **Must be set manually in the Vercel dashboard** (Project Settings → Environment Variables, Production) to the canonical domain — `https://www.opeswealth.app`. It is **critical for Supabase Auth redirects**: `getSiteURL()` in `src/app/auth/actions.ts` builds the sign-up confirmation and password-reset links from it. It should also match the domain the app's passkeys are registered under (WebAuthn credentials are bound to the domain; a mismatched site URL/domain breaks validation) — note the app code itself only reads this variable for the auth redirects; passkey domain binding was not verified against it in this pass.
- Fallback if unset on Vercel: `getSiteURL()` pins to the hardcoded production domain (never the per-deployment `VERCEL_URL`), so it degrades safely, but it should still be set explicitly.
- **New `.env.example`** documents every variable (Supabase keys, `NEXT_PUBLIC_SITE_URL`, the local-only mock-auth vars). `.gitignore` previously ignored `.env*` entirely, so an `!.env.example` exception was added.
- **Validation**: there is no central env schema, so `next.config.ts` now `console.warn`s at build/server start when `NODE_ENV === "production"` and `NEXT_PUBLIC_SITE_URL` is unset (a warning, not a build failure). `tsc --noEmit`/`eslint`/`npm run build` clean with the variable unset locally.


## Open Finance Environment Variables (2026-10-01)

- New optional server-side variables, documented in `.env.example`: `ALTAREQ_SANDBOX_MODE`, `ALTAREQ_CLIENT_ID`, `ALTAREQ_AUTH_URL`, `ALTAREQ_TOKEN_URL`, `ALTAREQ_API_BASE_URL`, `ALTAREQ_REDIRECT_URI` (`https://www.opeswealth.app/dashboard/banking/callback`), `ALTAREQ_CLIENT_CERT`/`ALTAREQ_CLIENT_KEY` (mTLS), and `BANK_TOKEN_ENCRYPTION_KEY` (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). `SUPABASE_SERVICE_ROLE_KEY` (already present in Vercel) is also used by the bank-token code. **Do not set `ALTAREQ_SANDBOX_MODE` in production.** Nothing needs to be set for the app to keep working: without them the Connect bank button is simply disabled. See [[Market-Data-Integration|Market Data Integration]].


## OCR Environment Variables (2026-10-06)

Four optional variables enable OCR of scanned bank PDFs via AWS Textract: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (both required for OCR; server-only), `AWS_REGION` (default `eu-central-1`, must support Textract) and `OCR_MAX_PAGES` (default 8, max 20). Not yet configured by Steve; without them the app runs normally and the UI says OCR is not set up. After adding them in Vercel, redeploy. Full steps, IAM policy and caveats: [[CSV-Bank-Uploads|CSV Bank Uploads]].

## AI Help Assistant Environment Variables (2026-10-01)

- `ANTHROPIC_API_KEY` (required for the chat; without it the widget reports it isn't set up), `ASSISTANT_MODEL` (optional, default `claude-sonnet-5-5`).
- Daily bug flush: `CRON_SECRET` (Vercel sends it as a Bearer token to the cron in `vercel.json`), plus a destination: `GITHUB_ISSUES_TOKEN` + `GITHUB_ISSUES_REPO` (`owner/name`; token needs Issues write) and/or `BUG_REPORT_WEBHOOK_URL`. Apply migration `0021` first. Details: [[Architecture|Architecture]].


## Demo Account & Seed Script (2026-10-01)

- **What**: `scripts/seed-demo.mts` creates (or resets) the demo login `demo@opeswealth.com` and fills it with a fictional, multi-currency portfolio for demos and screenshots. Default password `DemoPassword2026!` (override with `DEMO_EMAIL` / `DEMO_PASSWORD`).
- **Why a script and not a migration**: a migration would create a known-password account in every environment it reaches, production included, the moment it is applied. The script runs only when someone runs it, against the project in the env file they pass.
- **Run**: `node --env-file=.env.local scripts/seed-demo.mts --dry-run` builds the data and prints a summary without touching the network; `--yes` creates/resets the user and writes the data. Needs `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. It prints the target host before writing. Re-running is safe: it deletes only that user's own assets (history cascades) and re-inserts them. Uses Node's built-in TypeScript support (Node 22.18+), so no new dependency.
- **What it creates** (about 26 assets, ~1,100 monthly history rows, roughly USD 3.9M net worth at fixed FX): six Cash accounts (Emirates NBD, Wio, FAB, ADCB term deposit in AED/USD; BNP Paribas and BoursoBank in EUR), each with `bank_key` so the bank logo shows; three amortizing properties (Palm Jumeirah villa with a hybrid-rate loan, Downtown apartment, Paris 16e) plus an off-plan Dubai Creek Harbour unit with a payment schedule; two Private Equity funds (one with pending capital calls, one in harvest with distributions); six brokerage holdings with trades and dividends (USD and EUR); three vehicles (AED and EUR); and standalone liabilities (personal loan, business loan, auto finance, a Lyon mortgage, a credit card), which together with the property loans, the off-plan balance and the capital calls fill every row type of the Liabilities card. Real-estate history carries `net_equity` from the loan engine (a copy of `lib/amortization.ts` lives in the script; keep the two in step).
- **Not created**: no `bank_connections`/`bank_account_links`. Live bank sync isn't available yet and a fabricated "live" connection would carry no tokens and show a sync error; the banks appear via the Cash accounts' `bank_key` metadata instead.
- **Caveats**: all names, VINs, account references and prices are invented; brokerage prices are illustrative, so the app's own price refresh will replace them with live quotes. Anyone who knows the published password can sign in and edit that account, so on production use a password you keep private (set `DEMO_PASSWORD`) or reset/disable it after the demo. **Not yet run against any database**: verified only by a dry run plus tsc/lint/build; the first `--yes` run (and how the dashboard looks afterwards) is still to be checked.

## Co-ownership deploy checklist (2026-10-02)

- (`0025_co_ownership.sql` is applied, verified live 2026-10-06; `CRON_SECRET` is set on Vercel per the 2026-10-02 session.) Set `CRON_SECRET` on Vercel (the new `/api/cron/expire-changes` job, 06:30 UTC, uses it like the bug-report cron). Add `<site>/auth/callback` to Supabase's allowed redirect URLs and review the project's invite email template. `CO_OWNER_INVITE_EMAILS=off` suppresses invite emails (useful on preview deployments). See [[Co-Ownership|Co-Ownership]].


## Dependency security audit (2026-10-06)
- `npm audit` reported 6 vulnerabilities (5 high, 1 critical). **Critical (fixed):** Next.js 16.2.0-16.3.5, remote code execution in `next/og` `ImageResponse` (GHSA-vcvr-r3jv-pc5j). The app does not import `next/og`, so it was not reachable, but `next` and `eslint-config-next` are now pinned to **16.3.8** (patch bump, exact pins kept). Tests (1125), `tsc`, `eslint` and `npm run build` pass on it.
- **High x5 (not fixable, accepted):** one chain, `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob` -> `micromatch` -> `braces` (stack-exhaustion DoS on deeply nested glob patterns, GHSA-vfj7-8cjw-p6xm). `braces` 3.0.3 is already the newest release and the advisory flags every version, so there is no patched version to move to; the only `npm audit fix --force` suggestion downgrades to `eslint-config-next@14`, which would break the Next 16 lint setup, so it was **not** applied. Exposure is development tooling only (the linter globbing the repo's own files); none of it ships in the production bundle. Re-check with `npm audit` after future `eslint-config-next` releases.
- **Override attempt assessed (2026-10-06, second pass):** an `overrides`/`resolutions` entry can only pin a version that exists, and there is none to pin to. `npm view braces versions` ends at **3.0.3** and the advisory (GHSA-vfj7-8cjw-p6xm) covers `<=3.0.3`, so every published release is flagged; `micromatch` (4.x) and `fast-glob` (3.x) both require `braces ^3`, and `@next/eslint-plugin-next` requires `fast-glob`. Replacing a link in the chain with a different glob package or a stub would only silence `npm audit` while changing how the linter matches files, so it was **not** done. **`npm audit --omit=dev` reports 0 vulnerabilities**: nothing in the production dependency tree is affected. The 5 remaining findings are the same single dev-only chain; no override was added and `package.json` is unchanged by this item.


## Vercel hardening: Mumbai function region, site URL, Supabase variables (2026-10-06)
**Read from the Vercel API with the existing token (read-only, no values printed):** project `opes-wealth` (Next.js, Node 24.x, production branch `master`) had its **Function Region set to `iad1` (Washington, D.C.)** while the Supabase database is in Mumbai, so every query on a page load crossed an ocean.

**Done in the repo:** `vercel.json` now has `"regions": ["bom1"]` (Mumbai) next to the existing crons. `vercel.json` is the right place in this Next.js version: the route-segment `preferredRegion` option is documented as **deprecated** in `node_modules/next/dist/docs`, and nothing in `src` uses it. It takes effect on the next deployment after the commit is pushed.

### Steps for Steve in the Vercel dashboard
1. **Function Region (also keep the dashboard in sync).** Vercel -> project **opes-wealth** -> Settings -> **Functions** -> *Function Region* -> choose **Mumbai, India (bom1)** -> Save. (`vercel.json` already forces it for deployments; the dashboard value is what a human sees later, and it is currently `iad1`.) If a deployment is refused because of the region, your plan may not include more than one or this region: read the build log message. After the next deployment, check one response header: `x-vercel-id` should start with a Mumbai edge and contain `bom1` (for example `bom1::bom1::...`), or open the deployment -> Functions tab.
2. **`NEXT_PUBLIC_SITE_URL`.** Settings -> **Environment Variables**. It currently exists for **Production only**. Open it and confirm the value is exactly `https://www.opeswealth.app` (https, **no trailing slash**). This is a `NEXT_PUBLIC_` variable, so it is baked in at build time: after any change you must **Redeploy** (Deployments -> latest -> ... -> Redeploy). It is not set for Preview, so preview builds log the `next.config.ts` warning and preview e-mail/passkey links fall back to their own host; add a Preview value only if you want preview links to point at production.
3. **Supabase variables.** In Settings -> Environment Variables the app needs these three: `NEXT_PUBLIC_SUPABASE_URL` (Production, Preview, Development: present), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (all three: present) and **`SUPABASE_SERVICE_ROLE_KEY`** (Production only: present, but its value could not be checked from here, and the copy in `.env.local` had been invalid). To make sure Production has a working key: Supabase dashboard -> project `lpaollycwokxejrihrap` -> Project Settings -> **API Keys** -> copy the **service_role** secret -> Vercel -> edit `SUPABASE_SERVICE_ROLE_KEY` (Production), paste, tick **Sensitive**, Save -> **Redeploy**. Never prefix it with `NEXT_PUBLIC_`. The other Supabase/Postgres variables there (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `POSTGRES_*`) came from the Supabase integration and are not read by the app code.
4. **Also present and used:** `RESEND_API_KEY`, `CRON_SECRET`, `GITHUB_ISSUES_TOKEN`, `GITHUB_ISSUES_REPO` (the GitHub token value was not checked; the one in `.env.local` was rejected with 401, so test bug-report-to-issue before relying on it).
5. **Not set in Vercel (optional features, so those features are off):** `ANTHROPIC_API_KEY` (+ `ASSISTANT_MODEL`) for the AI help chat, `BANK_TOKEN_ENCRYPTION_KEY` and `ALTAREQ_*` for Open Finance, `RESEND_FROM` (custom sender), `CO_OWNER_INVITE_EMAILS`, and the market-data keys (`GOLDAPI_KEY`, `METALS_API_KEY`, `CHRONO24_API_KEY`, `WATCHCHARTS_API_KEY`, `THEWATCHAPI_KEY`). Never set `NEXT_PUBLIC_MOCK_AUTH` / `MOCK_AUTH_USER_ID` in Vercel (dev-only; already absent).
- **Verified live (2026-10-06 14:49 GST):** the production deployment of `645b317` went READY and `curl -I https://www.opeswealth.app/login` returned `X-Vercel-Id: bom1::bom1::...` (same for `/dashboard`), so functions now run in Mumbai. Page-load latency was not timed before/after. Steps 1-3 above (dashboard region setting, `NEXT_PUBLIC_SITE_URL` value, a working `SUPABASE_SERVICE_ROLE_KEY`) are still Steve's to do or confirm.

## Email deliverability audit & DNS records (2026-10-06)
**Problem:** invite emails land in the Hotmail/Outlook junk folder. **Audited read-only:** live DNS (`nslookup` against 8.8.8.8), the Resend domain record and Resend's sent-mail log, and the app's mail code. No mail was sent and nothing was changed.

### What exists today
| Item | State | Verdict |
|---|---|---|
| DNS host | Vercel DNS (`ns1/ns2.vercel-dns.com`) | records are added in the Vercel dashboard |
| Resend domain `opeswealth.app` | **verified**, sending enabled, region **ap-northeast-1 (Tokyo)**, open and click tracking **off**, receiving disabled | good (tracking off helps) |
| DKIM `resend._domainkey` TXT | present, verified, `d=opeswealth.app` | passes and is **aligned** with the From domain |
| SPF at `send.opeswealth.app` TXT | `v=spf1 include:amazonses.com ~all`, verified | passes; aligned (relaxed) because `send.` is a subdomain of the From domain |
| Return-path MX at `send.opeswealth.app` | `10 feedback-smtp.ap-northeast-1.amazonses.com`, verified | fine (bounces/complaints go to Resend) |
| `_dmarc` TXT | `v=DMARC1; p=none` | **no `rua`: you receive no reports and Microsoft/Google see an unmonitored policy** |
| Root `opeswealth.app` TXT (SPF) | **none** | gap |
| Root `opeswealth.app` MX | **none** | **gap: the From domain cannot receive mail** |
| App From address | `Opes Wealth <noreply@opeswealth.app>` (`src/lib/email.ts`, env `RESEND_FROM` unset in Vercel) | works, but a `noreply@` sender that cannot receive replies scores worse |
| Mail path of the invites | Supabase Auth `inviteUserByEmail` goes out through **Resend** (the 2026-10-02 invite shows an `ap-northeast-1.amazonses.com` message id), i.e. Supabase SMTP is already pointed at Resend | good |
| Links and logo in the templates | on `https://www.opeswealth.app` (not `supabase.co`) since 2026-10-02 | good |
| Resend log | only **3 emails ever sent** from this domain (created 2026-10-02), all **delivered**, including the invite to a Hotmail address on 2026-10-02 08:34 UTC | see diagnosis |

### Diagnosis
Authentication is **not broken**: DKIM and SPF pass and align, so DMARC passes. Hotmail *accepted* the invite ("delivered") and then filed it as junk. The causes are reputation and signals, not a hard failure:
1. **Brand-new domain with almost no sending history** (3 emails in 4 days). Outlook gives new senders no trust until recipients interact with the mail. DNS alone cannot buy that.
2. **The From domain cannot receive mail** (no MX) and has no root SPF: Outlook treats "can't reply to this domain" as a spam signal.
3. **DMARC `p=none` with no `rua`**: no reporting, and a monitoring-only policy.
4. A `noreply@` sender (engagement-based filters like replies and "not junk").
Expect the DNS fixes below to help and to be required hygiene, but be realistic: inbox placement at Hotmail improves mainly as the domain builds a clean history (see "Reputation steps").

### Records to add (Vercel dashboard -> Domains -> `opeswealth.app` -> DNS Records -> Add)
Add each one with TTL 60 (or the default). The `send.` and `resend._domainkey` records already exist and must **not** be touched.

**1. DMARC with reporting: replace the existing `_dmarc` record (only one DMARC record may exist, so edit or delete the old `v=DMARC1; p=none` first).**
- Type `TXT`, Name `_dmarc`, Value:
  `v=DMARC1; p=none; rua=mailto:dmarc@opeswealth.app; adkim=r; aspf=r; pct=100`
- `dmarc@opeswealth.app` can only receive reports once record 3 (root MX) exists and that mailbox or alias exists. **Alternative that works today:** use a mailbox on a domain you already run, e.g. `rua=mailto:steve.haro@navtech.me`, and add this authorization record in the **navtech.me** DNS: Type `TXT`, Name `opeswealth.app._report._dmarc`, Value `v=DMARC1`. (Without that authorization record most receivers will not send the reports.) A free DMARC-report service that gives you its own `rua` address is a third option.
- Keep `p=none` for 2 to 4 weeks, read the aggregate reports (they list every source sending as `opeswealth.app`), then tighten to `p=quarantine` and later `p=reject` once only Resend (and your mailbox provider, if any) appear and pass.

**2. Root SPF (so the bare domain also publishes who may send).** Type `TXT`, Name `@` (blank), Value:
- if you will **not** send from a mailbox at the root: `v=spf1 -all` (declares no host sends as the bare domain; Resend uses `send.` so it is unaffected);
- if you add a mailbox provider (record 3): use that provider's SPF instead, for example Google Workspace `v=spf1 include:_spf.google.com ~all`. Only **one** SPF record per name.

**3. Root MX handling (so `opeswealth.app` can receive mail, e.g. `hello@` and `dmarc@`).** Pick one provider and copy the exact values from its domain-setup screen (the values below are the usual ones, confirm them there):
- Google Workspace: Type `MX`, Name `@`, Priority `1`, Value `smtp.google.com`; SPF as in record 2.
- Microsoft 365: the MX value is tenant specific (`<tenant>-opeswealth-app.mail.protection.outlook.com`, priority 0); SPF `v=spf1 include:spf.protection.outlook.com ~all`.
- Free forwarding service (for example ImprovMX): `MX @ 10 mx1.improvmx.com` and `MX @ 20 mx2.improvmx.com`; SPF `v=spf1 include:spf.improvmx.com ~all`; then forward `hello@` and `dmarc@` to your own inbox.
Do **not** put the root MX on `send.` (that one belongs to Resend). Resend inbound ("Receiving") is currently off; do not enable it on the root.

### Sender settings to change (no DNS)
- Use a replyable sender, for example `Opes Wealth <hello@opeswealth.app>`, once record 3 exists. App emails: set `RESEND_FROM` in Vercel (Production) and redeploy. Supabase Auth emails (invites, sign-up, reset): Supabase dashboard -> Authentication -> Emails -> **SMTP Settings**: host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API key with sending access, sender email on `opeswealth.app`, sender name `Opes Wealth`. (The evidence shows SMTP already runs through Resend; this step is to confirm the sender matches the verified domain, since the setting itself could not be read from here.)

### Reputation steps (what actually moves Hotmail)
1. In the junk folder of the test Hotmail account: open the invite, **Not junk**, and **add the sender to Contacts / Safe senders**. Reply to one message. Microsoft weighs these signals heavily for new senders.
2. Send steadily at low volume at first; do not blast. Keep Resend open/click tracking **off** (it is), keep links on `opeswealth.app`, keep a plain, short subject.
3. Watch the Resend dashboard for bounces and complaints; a single complaint on a young domain matters.
4. If it still junks after 2 to 3 weeks of clean sending and passing DMARC, use Microsoft's Outlook.com sender-support/mitigation form and ask Resend support. (Microsoft SNDS/JMRP are for dedicated sending IPs; Resend's shared IPs are not enrolled by you.)

### Verify (after each DNS change; DNS can take minutes to an hour)
```
nslookup -type=TXT _dmarc.opeswealth.app 8.8.8.8
nslookup -type=TXT opeswealth.app 8.8.8.8
nslookup -type=MX opeswealth.app 8.8.8.8
```
Then have a real invite sent to the Hotmail address, open **View message source** (Outlook web: ... -> View -> View message source) and look for `Authentication-Results:` containing `dkim=pass header.d=opeswealth.app`, `spf=pass` and `dmarc=pass`. A free tester such as mail-tester.com (send one message to its generated address) gives a score and lists any remaining issue. Not done here: no test message was sent, and nothing was verified in a mailbox.

## Related
- [[Database-Schema|Database Schema]] — migrations to apply to the production database
- [[Live-Pricing|Live Pricing]] — `FINNHUB_API_KEY` secret set and functions deployed (2026-09-30)
- [[Authentication-Security|Authentication & Security]] — `NEXT_PUBLIC_SITE_URL`

### Price refresh cron (2026-10-09)
`/api/cron/refresh-prices` runs daily at 05:00 UTC (before `bug-reports` 06:00 and `expire-changes` 06:30). It needs `CRON_SECRET` and a working `SUPABASE_SERVICE_ROLE_KEY` in Vercel; Hobby plans allow daily crons only. First run should be triggered manually and its count-only JSON checked. See [[Live-Pricing|Live Pricing]].
