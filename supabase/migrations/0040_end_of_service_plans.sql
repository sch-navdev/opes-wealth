-- 0040_end_of_service_plans.sql
-- Opes Wealth: Personal Cash Flow, UAE end-of-service gratuity tracker. One row per employment
-- (employer) with its basic-wage history and the gratuity payments already received. The
-- calculation itself is in src/lib/uae-gratuity.ts (informational, not legal advice).
--
-- DRAFT, NOT APPLIED. Steve applies this in the Supabase SQL editor. Until it is applied the app
-- keeps working: the Gratuity section shows "not available yet" (42P01 / PGRST205 is swallowed).
--
-- Private to the owner (no co-owner sharing). The demo account stays read-only through the
-- restrictive policies at the end (same as 0037 / 0032).
--
-- wage_history: array of {"from": "YYYY-MM-DD", "basicMonthly": number}, 1 to 50 entries.
-- payments:     array of {"date": "YYYY-MM-DD", "amount": number, "note": text}, 0 to 100 entries.
-- Element shapes are validated by the app (lib/uae-gratuity.ts); the database enforces type and size.
--
-- Idempotent: safe to re-run.

create table if not exists public.end_of_service_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  employer text not null check (char_length(employer) between 1 and 120),
  start_date date not null,
  end_date date,
  contract_type text not null default 'unlimited' check (contract_type in ('unlimited', 'limited')),
  unpaid_leave_days integer not null default 0 check (unpaid_leave_days >= 0 and unpaid_leave_days <= 36500),
  wage_history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(wage_history) = 'array' and jsonb_array_length(wage_history) <= 50 and pg_column_size(wage_history) <= 20000),
  payments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(payments) = 'array' and jsonb_array_length(payments) <= 100 and pg_column_size(payments) <= 40000),
  employer_stated_balance numeric(18, 2) check (employer_stated_balance is null or employer_stated_balance >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint end_of_service_plans_end_after_start check (end_date is null or end_date >= start_date)
);

create index if not exists end_of_service_plans_profile_idx
  on public.end_of_service_plans (profile_id);

comment on table public.end_of_service_plans is
  'Personal Cash Flow: UAE end-of-service gratuity plan per employment (basic-wage history, payments received). Private to profile_id.';
comment on column public.end_of_service_plans.wage_history is 'Array of {from: date, basicMonthly: number}; the last entry in force is the last basic wage.';
comment on column public.end_of_service_plans.payments is 'Array of {date: date, amount: number, note: text}: gratuity already paid by the employer.';
comment on column public.end_of_service_plans.employer_stated_balance is 'What the employer says is still owed, for reconciliation (null = unknown).';

alter table public.end_of_service_plans enable row level security;

drop policy if exists "end_of_service_plans_select_own" on public.end_of_service_plans;
create policy "end_of_service_plans_select_own"
  on public.end_of_service_plans for select to authenticated
  using ((select auth.uid()) = profile_id);

drop policy if exists "end_of_service_plans_insert_own" on public.end_of_service_plans;
create policy "end_of_service_plans_insert_own"
  on public.end_of_service_plans for insert to authenticated
  with check ((select auth.uid()) = profile_id);

drop policy if exists "end_of_service_plans_update_own" on public.end_of_service_plans;
create policy "end_of_service_plans_update_own"
  on public.end_of_service_plans for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

drop policy if exists "end_of_service_plans_delete_own" on public.end_of_service_plans;
create policy "end_of_service_plans_delete_own"
  on public.end_of_service_plans for delete to authenticated
  using ((select auth.uid()) = profile_id);

revoke all on public.end_of_service_plans from anon;
grant select, insert, update, delete on public.end_of_service_plans to authenticated;

-- Demo account: read-only, like every other table (see 0032).
drop policy if exists demo_readonly_insert on public.end_of_service_plans;
drop policy if exists demo_readonly_update on public.end_of_service_plans;
drop policy if exists demo_readonly_delete on public.end_of_service_plans;
create policy demo_readonly_insert on public.end_of_service_plans as restrictive for insert to authenticated with check (not public.is_demo_user());
create policy demo_readonly_update on public.end_of_service_plans as restrictive for update to authenticated using (not public.is_demo_user()) with check (not public.is_demo_user());
create policy demo_readonly_delete on public.end_of_service_plans as restrictive for delete to authenticated using (not public.is_demo_user());
