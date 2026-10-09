[[PROJECT_TRACKER|← Project Tracker]]

# UHNW modules: technical plan (for approval, nothing built)

Status: **decisions approved by Steve 2026-10-08; build in progress (see Progress).** No code and no migration exists for any of this. SQL below is a draft for Steve to approve; it would be written as `supabase/migrations/00NN_*.sql` and applied by Steve in the SQL editor, never from here. Related: [[Entity-Structures|Entity Structures]], [[Portfolio-Dashboard|Portfolio Dashboard]], [[Database-Schema|Database Schema]], [[Design-System|Design System]].

## What already exists (so we extend, not rebuild)

- **Entity look-through:** `lib/entity-lookthrough.ts` already builds the tree (entities, sub-entities via `holding_company_id`, linked holdings via `metadata.held_asset_ids`), reconciles to net worth, and warns on double links. `components/entity-lookthrough.tsx` renders it as an indented tree. Gap: it is a list, not a map; links carry no ownership percentage; people (family members) are not nodes.
- **Private equity:** `lib/private-equity.ts` stores in `assets.metadata`: `commitment_amount`, `capital_calls[]` (`id, due_date, amount, percentage, status paid|pending`), `distributions_to_date` (one number), `projected_distributions[]`, an expected multiple. The Expert panel (`lib/dashboard-expert.ts:257`) already shows per-fund unfunded, DPI (distributions / paid-in) and TVPI ((NAV + distributions) / paid-in). Gaps: actual distributions are one lump with no dates, so no true IRR from dated cash flows and no portfolio-level DPI/TVPI/RVPI; no calendar of upcoming calls.
- **Notifications:** table `notifications` (migration 0034, kinds limited by a CHECK to `change_approved|rejected|auto_applied`), bell in `components/notifications-bell.tsx`, created only by server code with the service role; a cron route family exists under `app/api/cron`.
- **Storage:** one public bucket (`asset-photos`). No private document storage yet.

## Module 1. Global Wealth Node Map (Masttro-style)

**Goal:** an interactive map of family, trusts, holding companies and the assets beneath them, reconciling to the same net worth as the tree.

**Library choice: React Flow (`@xyflow/react`), not D3.** We need draggable nodes, zoom/pan, keyboard focus, custom React node cards (our Money component, Chronograph styling) and accessible labels; React Flow gives these, D3 would mean building them. Layout with `dagre` (tiny, deterministic top-down tree). Loaded with `next/dynamic` on the Companies page only, so the dashboard bundle does not grow. Accessibility: the existing tree stays as the accessible/printable view; the map is a second tab ("Map") and every node is focusable with an `aria-label` carrying name, type, value.

**Data (phase A, no migration):** derive nodes and edges from what `buildEntityLookthrough` already returns: node kinds `person` (the viewer, one synthetic node), `entity` (trust/foundation/company/SPV), `asset` (held), `personal` (held personally, grouped). Edges: person→entity (own stake, from the Company's ownership %), entity→sub-entity (`holding_company_id`), entity→asset (`held_asset_ids`). Edge label = share of value. Pure builder `lib/entity-map.ts` (`buildEntityMap(lookthrough) -> {nodes, edges}`) with the same reconciliation test (sum of leaf values = net worth).

**Data (phase B, optional, needs a migration):** ownership percentage on a link and non-user family members as nodes.

```sql
-- DRAFT, not applied
create table public.entity_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  parent_asset_id uuid not null references public.assets (id) on delete cascade, -- the entity
  child_asset_id  uuid not null references public.assets (id) on delete cascade, -- asset or sub-entity
  ownership_pct numeric(7,4) not null default 100 check (ownership_pct > 0 and ownership_pct <= 100),
  created_at timestamptz not null default now(),
  unique (parent_asset_id, child_asset_id)
);
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  relation text check (relation in ('self','spouse','child','parent','other')),
  created_at timestamptz not null default now()
);
-- RLS: owner-only select/insert/update/delete on both; demo read-only like 0032.
```

Phase B would also need a rule for fractional ownership in the reconciliation (an asset 60% in one entity and 40% personal). **Decision needed from Steve:** is phase A enough for now?

**Components:** `entity-map.tsx` (client, dynamic), `entity-map-node.tsx`, `lib/entity-map.ts` (+ tests), a Tree/Map tab switch on `companies/page.tsx`. Mobile: map is pan/zoom only, tree stays the default below 768 px.

## Module 2. Private Market Liquidity (Addepar-style)

**Goal:** a proper capital-account ledger per fund and a portfolio view: unfunded commitments, DPI, TVPI, RVPI, net IRR, and a forward calendar of expected calls.

**Storage choice (recommend A):**

- **A. Stay in `assets.metadata` (no migration, co-ownership scaling and RLS keep working).** Add `distributions: { id, date, amount, kind: "income"|"return_of_capital"|"gain" }[]` and keep `distributions_to_date` as a derived/legacy value (migrated on read: a legacy lump becomes one undated entry flagged `legacy`). Calls keep their current shape; add `paid_date` (when actually paid, versus `due_date`). Bounded array sizes (e.g. 200) in the validator, like the other metadata parsers.
- **B. A `pe_cash_flows` table** (draft below) if the ledger must be queryable across funds in SQL or imported in bulk (e.g. from fund statements). Costs a migration, RLS by `is_asset_member`, co-owner scaling logic duplicated.

```sql
-- DRAFT for option B only, not applied
create table public.pe_cash_flows (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  flow_date date not null,
  kind text not null check (kind in ('capital_call','distribution','fee','recallable')),
  amount numeric(20,4) not null check (amount > 0),
  currency char(3) not null,
  status text not null default 'actual' check (status in ('actual','scheduled')),
  created_at timestamptz not null default now()
);
create index on public.pe_cash_flows (asset_id, flow_date);
-- RLS: select/insert/update/delete where public.is_asset_member(asset_id) (the existing function).
```

**Metrics (pure, tested, `lib/pe-liquidity.ts`):** paid-in = sum of paid calls; unfunded = commitment − paid-in (never negative; recallable amounts noted); DPI = distributions / paid-in; RVPI = NAV / paid-in; TVPI = DPI + RVPI (matches the existing formula, so Expert numbers do not change); net IRR from dated flows with terminal NAV, reusing the app's existing IRR code (`lib/irr.ts`) and returning `null` rather than a wrong number when there is no sign change. All in the fund currency, converted to base for the portfolio roll-up with the existing FX layer; the portfolio DPI/TVPI is computed from summed paid-in/distributions/NAV in base currency, not by averaging fund ratios.

**UI:** `components/pe-liquidity-panel.tsx` in the Expert tier (replaces the table's three ratio columns with a drill-down), a per-fund "Cash-flow ledger" editor in the Private Equity settings section (add/edit call and distribution rows, same edit-mode and co-owner approval path as other metadata edits), and a 12-month "Upcoming calls" strip feeding the income calendar. Data-quality (`lib/data-quality.ts`) already flags overdue calls; it would also flag "distributions with no date".

**Open question:** are projected (expected) calls/distributions part of this, or only actuals? Today projections never touch net worth; the plan keeps that.

## Module 3. Governance Vault (Altoo-style)

**Goal:** attach documents (title deed, K-1, passport, insurance, trust deed) to assets or entities, with expiry dates that raise alerts in the notifications bell.

**Security model (the important part):**

- **Private bucket** `governance-vault` (not public; unlike `asset-photos`). Object path `{owner_id}/{asset_id}/{uuid}-{sanitised-name}`; downloads only through short-lived signed URLs (60 s) issued by a server action after an auth check; never public URLs.
- **RLS on storage objects and on the metadata table** by `is_asset_member(asset_id)`; entity-level documents hang off the entity's asset row (entities already are assets). **Co-owners:** by default a document is visible to co-owners of that asset; a per-document `owner_only` flag hides passports and the like. **Demo account:** read-only, no upload.
- **MFA step-up** for download and upload (the same AAL2 gate `needsMfaStepUp` already used for the chat and banking). Upload allowlist (PDF, PNG, JPEG), 15 MB cap, magic-byte check server-side, no inline rendering of anything but PDF/images in a sandboxed viewer. No malware scanning is available in our stack: **stated limitation**.
- **Encryption:** Supabase storage is encrypted at rest; app-level encryption of files is out of scope for v1 (flagged: a UHNW buyer may ask for customer-managed keys). **Never sent to the AI chat or any third party; never logged.** Deletion is a hard delete of the object plus the row (confirm dialog).
- **Audit trail:** `document_access_log` (who, which document, action view/download/delete, when) readable by the document owner.

```sql
-- DRAFT, not applied
create table public.asset_documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  doc_type text not null check (doc_type in ('title_deed','k1','passport','insurance','trust_deed','contract','other')),
  title text not null check (char_length(title) between 1 and 120),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 15728640),
  issued_on date,
  expires_on date,
  owner_only boolean not null default false,
  remind_days integer[] not null default '{90,30,7}',
  created_at timestamptz not null default now()
);
create index on public.asset_documents (asset_id);
create index on public.asset_documents (expires_on) where expires_on is not null;
create table public.document_access_log (
  id bigint generated always as identity primary key,
  document_id uuid references public.asset_documents (id) on delete set null,
  actor_id uuid not null references public.profiles (id),
  action text not null check (action in ('view','download','delete','upload')),
  at timestamptz not null default now()
);
-- notifications.kind CHECK must be widened (drop/re-add) to allow 'document_expiring' and 'document_expired'.
-- RLS: asset_documents select where is_asset_member(asset_id) and (not owner_only or uploaded_by = auth.uid()); writes by owner/uploader; demo read-only.
```

**Expiry alerts:** a daily job (the same Vercel Cron pattern as the bug flush; `CRON_SECRET`) scans `expires_on` against each document's `remind_days`, and inserts one notification per (document, threshold) using the service role, de-duplicated by a `data.threshold` key so a reminder fires once. `notifications.ts` gains the two kinds and message keys (nine languages). The bell needs no structural change. Also an "expiring soon" row in the Data-quality list so it is visible without opening the bell.

**UI:** `components/vault/` (document list on the asset detail page and on the entity page, upload dialog with expiry picker, expiry badge colours using existing tokens), a "Documents" tab in `asset-detail-view` (lazy-loaded like the other sections). Tier: Professional and up.

## Suggested order and size

1. **Module 2, option A** (no migration, extends what is there, immediate value for the PE-heavy user): about 3 units (pure metrics + tests; ledger editor; Expert panel).
2. **Module 1, phase A** (no migration): about 2 units (builder + tests; React Flow tab).
3. **Module 3** last: needs migration, private bucket, cron, and a security review; about 5 units.

## Decisions needed before any code

1. Module 1: phase A only (derived map) or also phase B (ownership % and family members)?
2. Module 2: option A (metadata) or B (table)? Actuals only, or projections too?
3. Module 3: confirm co-owner visibility default, the 15 MB / PDF+image limits, no customer-managed keys in v1, Professional-and-up only.
4. React Flow adds one dependency (about 100 KB gzipped, lazy-loaded): accepted?

## Decisions (Steve, 2026-10-08: agreed to all four recommendations)
1. Node map: **phase A only** (derived from existing data, no migration).
2. PE ledger: **inside the asset metadata (option A), actuals only**; projections stay out of net worth.
3. Governance vault: co-owners see documents by default with an owner-only switch, 15 MB limit, PDF and images only, no customer-managed keys in v1, Professional tier and up.
4. **React Flow accepted** for the map (lazy-loaded on the Companies page only).

## Progress
- **Module 2, unit 1 (done, 2026-10-08):** `lib/private-equity.ts` gained `distributions: ActualDistribution[]` (dated; capped at 200; parser drops malformed rows), `paid_date` on a capital call, `distributedCapital()` (dated ledger when present, else the legacy lump), and validation codes `pe_paid_date_invalid`, `pe_ledger_too_long`, `pe_actual_distribution_invalid` (no UI string yet: the editor unit adds them in nine languages). New `lib/pe-liquidity.ts`: `buildFundLedger` (paid-in, unfunded, DPI, RVPI, TVPI, net IRR via `xirr` with the NAV as terminal value, null with a reason when flows are undated), `scaleFundLedger`, `buildPortfolioLiquidity` (ratios from summed paid-in, not averaged; pooled IRR) and `upcomingCalls`. 15 new tests incl. an exact IRR (sqrt(1.5)-1). No UI and no migration yet; the Expert panel still shows its old DPI/TVPI, which the new TVPI matches.
- **Next:** module 2 unit 2 (cash-flow ledger editor in the PE settings), unit 3 (Expert liquidity panel + upcoming calls strip); then module 1 phase A; then module 3.

## Related
- [[Entity-Structures|Entity Structures]], [[Portfolio-Dashboard|Portfolio Dashboard]], [[Database-Schema|Database Schema]], [[Design-System|Design System]], [[Changelog|Changelog]]

## Progress (2026-10-09)
- Module 1 (node map) phase A: built, see [[Entity-Structures|Entity Structures]] (visuals unverified).
- Module 2 (private-market liquidity ledger): ledger editor (paid calls with `paid_date`, dated actual distributions, in `assets.metadata`, edits through `updateAsset` / `routeAssetEdit` so co-owner approval applies) in the PE Settings section (`asset-detail/private-equity-ledger-editor.tsx`, `lib/pe-ledger-edit.ts`), validators extended with a real-calendar-date check and a call-row cap, and the Expert block `expertLiquidity` (paid-in, unfunded, NAV, distributed, DPI, RVPI, TVPI, net IRR per fund, portfolio row, 12-month upcoming-calls strip; `lib/pe-liquidity-data.ts`, `components/pe-liquidity-panel.tsx`). The Expert PE panel and commitment card now read `distributedCapital`. 55 keys. Open: visual check, real co-owner round trip, data-quality flag for undated distributions.
- Module 3 (governance vault): built, see [[Governance-Vault|Governance Vault]] (migration 0038 drafted, not applied).
