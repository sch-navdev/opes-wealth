-- 0020_bank_connections.sql
-- Opes Wealth: UAE Open Finance (Al Tareq) bank-sync storage.
--
--   bank_connections    one row per consent/connection to a bank. OAuth tokens
--                       (and the PKCE verifier of a pending flow) are stored
--                       ENCRYPTED by the app (AES-256-GCM, key in the server
--                       environment — see src/lib/banking/token-crypto.ts).
--   bank_account_links  maps a bank's account to one of the user's Cash assets
--                       and records when/how it last synced.
--
-- Security model: row-level security limits every row to its owner, AND the
-- secret columns are not selectable by the `authenticated`/`anon` roles at all
-- (column-level privileges below), so even the user's own browser session can
-- never read a token. The server reads/writes tokens with the service role
-- after authenticating the user (src/utils/supabase/service.ts); the browser
-- role can only read the non-secret columns and delete its own rows.
--
-- Also adds 'open_finance' to asset_history.source (balances written by a
-- live sync), keeping every value already allowed (superset of 0015).
-- Apply with `supabase db push` or paste into the SQL editor.

create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- altareq = UAE Open Finance (Al Tareq); psd2 = EU open banking via a licensed
  -- provider (French banks — sandbox only until a provider is integrated).
  provider text not null default 'altareq' check (provider in ('altareq', 'psd2')),
  institution_id text not null,
  institution_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'revoked', 'error')),
  -- Sandbox connection (development/testing): fake banks and balances that
  -- must never reach real net worth. Its account links have NO asset (see the
  -- constraints on bank_account_links below).
  is_sandbox boolean not null default false,
  consent_id text,
  consent_expires_at timestamptz,
  -- Pending OAuth flow only (cleared once the code is exchanged).
  oauth_state text,
  encrypted_code_verifier text,
  oauth_started_at timestamptz,
  -- Encrypted by the app; never selectable by browser roles.
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('ok', 'error')),
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_connections_profile_idx
  on public.bank_connections (profile_id);

create table if not exists public.bank_account_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  connection_id uuid not null references public.bank_connections (id) on delete cascade,
  -- A live link points at one of the user's Cash assets; a SANDBOX link has
  -- no asset at all, so sandbox data is structurally unable to touch an asset's
  -- value or history (enforced by the two checks below).
  asset_id uuid references public.assets (id) on delete cascade,
  is_sandbox boolean not null default false,
  external_account_id text not null,
  account_label text,
  masked_number text,
  currency text,
  -- Latest balance reported by the bank. For sandbox links this is shown in
  -- the banking view only; there is no asset to copy it onto.
  last_balance numeric,
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('ok', 'error')),
  last_sync_error text,
  created_at timestamptz not null default now(),
  unique (connection_id, external_account_id),
  unique (asset_id),
  constraint bank_account_links_sandbox_has_no_asset check (not is_sandbox or asset_id is null),
  constraint bank_account_links_live_has_asset check (is_sandbox or asset_id is not null)
);

-- A link's sandbox flag must equal its connection's, so a sandbox connection
-- can't be given an asset-backed link (or the reverse) by any code path.
create or replace function public.bank_account_links_match_connection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_sandbox is distinct from (
    select c.is_sandbox from public.bank_connections c where c.id = new.connection_id
  ) then
    raise exception 'bank_account_links.is_sandbox must match its connection';
  end if;
  return new;
end;
$$;

drop trigger if exists bank_account_links_match_connection on public.bank_account_links;
create trigger bank_account_links_match_connection
  before insert or update on public.bank_account_links
  for each row execute function public.bank_account_links_match_connection();

create index if not exists bank_account_links_profile_idx
  on public.bank_account_links (profile_id);

alter table public.bank_connections enable row level security;
alter table public.bank_account_links enable row level security;

create policy "bank_connections_select_own"
  on public.bank_connections for select to authenticated
  using (auth.uid() = profile_id);

create policy "bank_connections_delete_own"
  on public.bank_connections for delete to authenticated
  using (auth.uid() = profile_id);

create policy "bank_account_links_select_own"
  on public.bank_account_links for select to authenticated
  using (auth.uid() = profile_id);

create policy "bank_account_links_delete_own"
  on public.bank_account_links for delete to authenticated
  using (auth.uid() = profile_id);

-- Column-level privileges: browser roles get NOTHING by default…
revoke all on public.bank_connections from anon, authenticated;
revoke all on public.bank_account_links from anon, authenticated;

-- …then only the non-secret columns are readable, and rows deletable.
grant select (
  id, profile_id, provider, institution_id, institution_name, status, is_sandbox,
  consent_id, consent_expires_at, last_synced_at, last_sync_status,
  last_sync_error, created_at, updated_at
) on public.bank_connections to authenticated;
grant delete on public.bank_connections to authenticated;

grant select on public.bank_account_links to authenticated;
grant delete on public.bank_account_links to authenticated;

-- asset_history.source: superset of 0015 + 'open_finance'.
alter table public.asset_history drop constraint if exists asset_history_source_check;
alter table public.asset_history
  add constraint asset_history_source_check
  check (
    source in (
      'manual', 'dari', 'dubailand', 'csv_import', 'coingecko', 'finnhub',
      'yahoo', 'broker_import', 'vehicle_valuation', 'file_import', 'dld',
      'adrec', 'saxo', 'open_finance'
    )
  );
