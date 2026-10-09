-- 0039_fx_rates_daily.sql
-- Opes Wealth: daily exchange-rate history, so a value recorded on a past date is converted at THAT
-- day's rate when the user switches the Base Currency (dashboard chart, category series, sparklines).
--
-- WRITTEN, NOT APPLIED. Steve applies this in the Supabase SQL editor. Nothing in the repo runs it.
-- Until it is applied the app keeps working exactly as before (history converted at today's rate) and
-- the rate-status indicator shows "history not available yet".
--
-- fx_rates_daily: one row per (rate_date, currency). rate_per_usd = units of `currency` per 1 USD.
--   rate_date is the GST (UTC+4) calendar day of the midnight fixing (cron runs at 20:00 UTC).
--   source: ecb (backfill from Frankfurter/ECB), live (daily cron / manual refresh), peg (constant
--   official peg), carried (copied from the nearest earlier date), manual (hand-entered).
-- fx_rate_runs: one row per run of the cron / manual refresh / backfill, read by the status indicator.
--
-- Rates are public data: any signed-in user may READ. Nobody but the service role may write (no
-- INSERT/UPDATE/DELETE policy for authenticated; writes go through server code with the service key).
-- The demo account is read-only everywhere already (it has no write policy here either).
--
-- Idempotent: safe to re-run.

create table if not exists public.fx_rates_daily (
  rate_date date not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  rate_per_usd numeric(24, 10) not null check (rate_per_usd > 0),
  source text not null check (source in ('ecb', 'live', 'peg', 'carried', 'manual')),
  fetched_at timestamptz not null default now(),
  primary key (rate_date, currency)
);

create index if not exists fx_rates_daily_currency_date_idx
  on public.fx_rates_daily (currency, rate_date desc);

comment on table public.fx_rates_daily is
  'Daily FX history: units of currency per 1 USD at the GST-midnight fixing. Public data, written only by the service role.';
comment on column public.fx_rates_daily.source is
  'ecb = Frankfurter/ECB backfill, live = daily cron or manual refresh, peg = constant official peg, carried = copied from an earlier date, manual = hand-entered.';

create table if not exists public.fx_rate_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  kind text not null check (kind in ('cron', 'manual', 'backfill')),
  ok boolean not null,
  currencies integer not null default 0 check (currencies >= 0),
  source text not null default '',
  error_code text
);

create index if not exists fx_rate_runs_ran_at_idx
  on public.fx_rate_runs (ran_at desc);

comment on table public.fx_rate_runs is
  'One row per FX refresh run (cron, manual or backfill). Counts and codes only; no secrets.';

alter table public.fx_rates_daily enable row level security;
alter table public.fx_rate_runs enable row level security;

drop policy if exists "fx_rates_daily_select_authenticated" on public.fx_rates_daily;
create policy "fx_rates_daily_select_authenticated"
  on public.fx_rates_daily for select to authenticated
  using (true);

drop policy if exists "fx_rate_runs_select_authenticated" on public.fx_rate_runs;
create policy "fx_rate_runs_select_authenticated"
  on public.fx_rate_runs for select to authenticated
  using (true);

-- No insert / update / delete policy: only the service role (server code) writes these tables.
-- Belt and braces: take the write privileges away from the browser roles as well.
revoke insert, update, delete, truncate on public.fx_rates_daily from anon, authenticated;
revoke insert, update, delete, truncate on public.fx_rate_runs from anon, authenticated;
revoke all on public.fx_rates_daily from anon;
revoke all on public.fx_rate_runs from anon;
grant select on public.fx_rates_daily to authenticated;
grant select on public.fx_rate_runs to authenticated;
