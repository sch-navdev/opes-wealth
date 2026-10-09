-- 0037_income_streams.sql
-- Opes Wealth: Personal Cash Flow, step 1. One row per source of EARNED income (salary, bonus,
-- freelance, rental outside the asset ledger, pension, other dividends...). Amounts are NET: what
-- actually lands in the bank. They feed the /dashboard/cash-flow page and the income calendar's
-- optional "earned income" layer (src/lib/income-streams.ts).
--
-- WRITTEN, NOT APPLIED. Steve applies this in the Supabase SQL editor. Nothing in the repo
-- runs it. Until it is applied the app keeps working: the page shows an empty list and saving
-- reports "not available yet" (relation does not exist, 42P01 / PGRST205, is swallowed).
--
-- Private to the owner: no co-owner sharing in v1. A signed-in user can read, add, change and
-- delete only their own rows. The demo account stays read-only through the restrictive policies
-- created at the end (same as 0034; re-running 0032 would also add them).
--
-- Columns: pay_day (1-31, null = 1st; clamped to the month's last day by the app),
-- pay_month (1-12): the month of the payment for 'annual' and 'one_off', the FIRST month of the
-- 4 for 'quarterly', unused for 'monthly'. end_date null = open ended.
--
-- Idempotent: safe to re-run.

create table if not exists public.income_streams (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('salary', 'bonus', 'freelance', 'rental', 'pension', 'dividend_other', 'other')),
  label text not null check (char_length(label) between 1 and 120),
  source_name text not null default '' check (char_length(source_name) <= 120),
  amount numeric(18, 2) not null check (amount >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'annual', 'one_off')),
  pay_day smallint check (pay_day between 1 and 31),
  pay_month smallint check (pay_month between 1 and 12),
  start_date date not null,
  end_date date,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint income_streams_end_after_start check (end_date is null or end_date >= start_date)
);

create index if not exists income_streams_profile_idx
  on public.income_streams (profile_id);

comment on table public.income_streams is
  'Personal Cash Flow: one row per earned-income stream (NET amounts, as received in the bank). Private to profile_id.';
comment on column public.income_streams.amount is 'NET amount per payment, in `currency` (what lands in the bank).';
comment on column public.income_streams.pay_day is 'Day of month 1-31 (null = 1st); clamped to the last day of shorter months by the app.';
comment on column public.income_streams.pay_month is 'Month 1-12: payment month for annual / one_off, first month for quarterly (every 3 months), unused for monthly.';
comment on column public.income_streams.end_date is 'Last date a payment can fall on; null = open ended.';

alter table public.income_streams enable row level security;

drop policy if exists "income_streams_select_own" on public.income_streams;
create policy "income_streams_select_own"
  on public.income_streams for select to authenticated
  using ((select auth.uid()) = profile_id);

drop policy if exists "income_streams_insert_own" on public.income_streams;
create policy "income_streams_insert_own"
  on public.income_streams for insert to authenticated
  with check ((select auth.uid()) = profile_id);

drop policy if exists "income_streams_update_own" on public.income_streams;
create policy "income_streams_update_own"
  on public.income_streams for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

drop policy if exists "income_streams_delete_own" on public.income_streams;
create policy "income_streams_delete_own"
  on public.income_streams for delete to authenticated
  using ((select auth.uid()) = profile_id);

-- Table privileges: signed-in users only (RLS above limits them to their own rows); anon gets nothing.
revoke all on public.income_streams from anon;
grant select, insert, update, delete on public.income_streams to authenticated;

-- Demo account: read-only, like every other table (see 0032).
drop policy if exists demo_readonly_insert on public.income_streams;
drop policy if exists demo_readonly_update on public.income_streams;
drop policy if exists demo_readonly_delete on public.income_streams;
create policy demo_readonly_insert on public.income_streams as restrictive for insert to authenticated with check (not public.is_demo_user());
create policy demo_readonly_update on public.income_streams as restrictive for update to authenticated using (not public.is_demo_user()) with check (not public.is_demo_user());
create policy demo_readonly_delete on public.income_streams as restrictive for delete to authenticated using (not public.is_demo_user());
