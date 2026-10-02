-- 0031_future_projects.sql
-- Opes Wealth: "Future Projects" simulations (/dashboard/planning).
--
--   assets.status  'active' (the real portfolio, default) or 'simulation' (a project the
--                  user is only planning). Every net-worth, dashboard, export, company and
--                  banking query filters on status = 'active', so a simulation can never
--                  leak into live figures.
--   assets.plan    the project's financing inputs (Day D, LTV, rate, term, own cash).
--                  A separate column, not metadata, because the per-category forms rewrite
--                  `metadata` wholesale on every edit and would drop it.
--
-- Existing rows become 'active' through the column default, so nothing changes for them.
-- APPLY THIS BEFORE DEPLOYING the matching app version: the app filters on the column.
-- Idempotent: safe to re-run.

alter table public.assets
  add column if not exists status text not null default 'active'
    check (status in ('active', 'simulation')),
  add column if not exists plan jsonb not null default '{}'::jsonb;

create index if not exists assets_profile_status_idx on public.assets (profile_id, status);
