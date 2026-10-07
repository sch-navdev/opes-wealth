-- 0035_dashboard_layout.sql
-- Opes Wealth: customisable dashboard. Stores each account's dashboard layout (block order,
-- which blocks are switched off, block sizes, kept per UI tier) as one small JSON document on
-- the user's own profile row. Shape (validated by the app, src/lib/dashboard-layout.ts):
--   { "version": 1, "tiers": { "expert": { "version": 1, "order": [...], "hidden": [...], "sizes": {...} }, ... } }
--
-- WRITTEN, NOT APPLIED. Steve applies this in the Supabase SQL editor. Nothing in the repo
-- runs it. Until it is applied the app keeps working: reading/saving the layout fails with
-- "column profiles.dashboard_layout does not exist" (42703), the code swallows that, and the
-- dashboard falls back to a layout kept in the browser (localStorage "opes-dashboard-layout-v1").
--
-- Security: no new policy and no new grant are needed. profiles already has RLS with
-- profiles_select_own / profiles_update_own (id = auth.uid(), USING and WITH CHECK, migration
-- 0001), and profiles has no column-level revoke, so a signed-in user can read and update this
-- column on their own row only. The demo account stays read-only through its restrictive
-- policies (0032), which apply to the whole table.
--
-- Idempotent: safe to re-run (the CHECK is created together with the column, so a re-run skips both).

alter table public.profiles
  add column if not exists dashboard_layout jsonb
  constraint profiles_dashboard_layout_valid check (
    dashboard_layout is null
    or (
      jsonb_typeof(dashboard_layout) = 'object'
      and octet_length(dashboard_layout::text) <= 16384
    )
  );

comment on column public.profiles.dashboard_layout is
  'Per-account dashboard layout (block order, hidden blocks, sizes, per UI tier). JSON object, max 16 KB, validated and normalised by the app.';
