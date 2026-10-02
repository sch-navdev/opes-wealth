-- 0025_co_ownership.sql
-- Opes Wealth: multi-player co-ownership and the change-approval workflow.
--
--   asset_owners          who owns an asset and in what percentage — a registered
--                         profile (profile_id) or, until they sign up, just a name
--                         and email. An asset with NO rows is 100% owned by
--                         assets.profile_id (every pre-existing asset).
--   asset_change_requests staged edits to a shared asset: a JSONB payload, a status
--                         and an expiry (7 days). Pending requests are auto-applied
--                         after expiry by the daily cron route (see
--                         src/app/api/cron/expire-changes/route.ts).
--   change_approvals      one row per registered co-owner who must approve a request.
--
-- Security model: assets.profile_id stays the CREATOR and the only role that can
-- write assets directly. Co-owners get READ access (assets, asset_history,
-- owners, requests) through the security-definer helper below; every write to
-- these new tables, and every application of a change request, goes through
-- server actions using the service role after the app has authorised the user.
--
-- The 100% total is validated by the server (src/lib/ownership.ts) — a DB
-- constraint can't see the whole set while rows are written one request at a time.
-- Idempotent: safe to re-run.

-- =========================================================================
-- asset_owners
-- =========================================================================

create table if not exists public.asset_owners (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  -- Null until the invited person has an account.
  profile_id uuid references public.profiles (id) on delete set null,
  name text not null default '',
  email text,
  ownership_percentage numeric not null
    check (ownership_percentage > 0 and ownership_percentage <= 100),
  is_creator boolean not null default false,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint asset_owners_has_identity check (profile_id is not null or email is not null)
);

create unique index if not exists asset_owners_asset_profile_key
  on public.asset_owners (asset_id, profile_id) where profile_id is not null;
create unique index if not exists asset_owners_asset_email_key
  on public.asset_owners (asset_id, lower(email)) where email is not null;
create index if not exists asset_owners_profile_idx on public.asset_owners (profile_id);
create index if not exists asset_owners_email_idx on public.asset_owners (lower(email));

-- Membership helper. Created AFTER asset_owners on purpose: a `language sql` function
-- body is validated at creation, so the table it reads must already exist.
create or replace function public.is_asset_member(p_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assets a
    where a.id = p_asset_id and a.profile_id = auth.uid()
  ) or exists (
    select 1 from public.asset_owners o
    where o.asset_id = p_asset_id and o.profile_id = auth.uid()
  );
$$;

alter table public.asset_owners enable row level security;

drop policy if exists "asset_owners_select_member" on public.asset_owners;
create policy "asset_owners_select_member"
  on public.asset_owners for select to authenticated
  using (public.is_asset_member(asset_id));

-- =========================================================================
-- Co-owners can READ the shared asset and its history
-- =========================================================================

drop policy if exists "assets_select_co_owner" on public.assets;
create policy "assets_select_co_owner"
  on public.assets for select to authenticated
  using (public.is_asset_member(id));

drop policy if exists "asset_history_select_co_owner" on public.asset_history;
create policy "asset_history_select_co_owner"
  on public.asset_history for select to authenticated
  using (public.is_asset_member(asset_id));

-- =========================================================================
-- asset_change_requests / change_approvals
-- =========================================================================

create table if not exists public.asset_change_requests (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  -- { fields: {name, category_id, quantity, current_value, currency, metadata,
  --            images, ticker_symbol, purchase_date}, owners?: [...] }
  proposed_payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- True when the daily job applied it after expiry (status is then 'approved').
  auto_approved boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  resolved_at timestamptz
);

create index if not exists asset_change_requests_asset_idx
  on public.asset_change_requests (asset_id);
create index if not exists asset_change_requests_pending_expiry_idx
  on public.asset_change_requests (expires_at) where status = 'pending';

create table if not exists public.change_approvals (
  id uuid primary key default gen_random_uuid(),
  change_request_id uuid not null references public.asset_change_requests (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (change_request_id, profile_id)
);

create index if not exists change_approvals_profile_idx
  on public.change_approvals (profile_id, status);

alter table public.asset_change_requests enable row level security;
alter table public.change_approvals enable row level security;

drop policy if exists "asset_change_requests_select_member" on public.asset_change_requests;
create policy "asset_change_requests_select_member"
  on public.asset_change_requests for select to authenticated
  using (public.is_asset_member(asset_id));

drop policy if exists "change_approvals_select_involved" on public.change_approvals;
create policy "change_approvals_select_involved"
  on public.change_approvals for select to authenticated
  using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.asset_change_requests r
      where r.id = change_request_id and r.requested_by = auth.uid()
    )
  );

-- No insert/update/delete policies: browser roles can't write these tables.

-- =========================================================================
-- Onboarding: when a profile is created, link every invitation sent to the
-- new user's email so the shared assets appear on their dashboard at once.
-- (Covers both an invited user accepting and a user who registers on their own.)
-- =========================================================================

create or replace function public.link_pending_co_owners()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select lower(u.email) into v_email from auth.users u where u.id = new.id;
  if v_email is not null then
    update public.asset_owners
       set profile_id = new.id
     where profile_id is null
       and lower(email) = v_email;
  end if;
  return new;
end;
$$;

drop trigger if exists link_pending_co_owners on public.profiles;
create trigger link_pending_co_owners
  after insert on public.profiles
  for each row execute function public.link_pending_co_owners();

-- Resolve an email to an existing profile (service role only: it would otherwise
-- let any signed-in user enumerate registered emails).
create or replace function public.profile_id_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.profile_id_for_email(text) from public, anon, authenticated;
grant execute on function public.profile_id_for_email(text) to service_role;
