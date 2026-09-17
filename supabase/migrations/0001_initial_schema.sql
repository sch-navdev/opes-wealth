-- 0001_initial_schema.sql
-- Opes Wealth: initial wealth-tracking schema (profiles, asset categories,
-- assets, asset history) with Row Level Security.

create extension if not exists "pgcrypto";

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  default_currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table if not exists public.asset_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.asset_categories (id) on delete restrict,
  name text not null,
  ticker_symbol text,
  quantity numeric not null default 1,
  current_value numeric not null,
  currency text not null default 'USD',
  is_liability boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  recorded_date date not null,
  value numeric not null,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- Indexes
-- =========================================================================

create index if not exists assets_profile_id_idx on public.assets (profile_id);
create index if not exists assets_category_id_idx on public.assets (category_id);
create index if not exists asset_history_asset_id_idx on public.asset_history (asset_id);

-- =========================================================================
-- Seed data
-- =========================================================================

insert into public.asset_categories (name, slug) values
  ('Real Estate', 'real-estate'),
  ('SCPI', 'scpi'),
  ('Equities', 'equities'),
  ('Crypto', 'crypto'),
  ('Cash', 'cash'),
  ('Liabilities', 'liabilities')
on conflict (slug) do nothing;

-- =========================================================================
-- Row Level Security
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.asset_categories enable row level security;
alter table public.assets enable row level security;
alter table public.asset_history enable row level security;

-- profiles: users may only see and manage their own profile row (id = auth.uid()).

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);

-- asset_categories: shared reference data, readable by any authenticated user.
-- No user owns these rows, so no write policies are defined here.

create policy "asset_categories_select_authenticated"
  on public.asset_categories for select
  to authenticated
  using (true);

-- assets: users may only see and manage rows whose profile_id is their own.

create policy "assets_select_own"
  on public.assets for select
  using (auth.uid() = profile_id);

create policy "assets_insert_own"
  on public.assets for insert
  with check (auth.uid() = profile_id);

create policy "assets_update_own"
  on public.assets for update
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

create policy "assets_delete_own"
  on public.assets for delete
  using (auth.uid() = profile_id);

-- asset_history: ownership is derived through the parent asset's profile_id.

create policy "asset_history_select_own"
  on public.asset_history for select
  using (
    exists (
      select 1 from public.assets
      where assets.id = asset_history.asset_id
        and assets.profile_id = auth.uid()
    )
  );

create policy "asset_history_insert_own"
  on public.asset_history for insert
  with check (
    exists (
      select 1 from public.assets
      where assets.id = asset_history.asset_id
        and assets.profile_id = auth.uid()
    )
  );

create policy "asset_history_update_own"
  on public.asset_history for update
  using (
    exists (
      select 1 from public.assets
      where assets.id = asset_history.asset_id
        and assets.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.assets
      where assets.id = asset_history.asset_id
        and assets.profile_id = auth.uid()
    )
  );

create policy "asset_history_delete_own"
  on public.asset_history for delete
  using (
    exists (
      select 1 from public.assets
      where assets.id = asset_history.asset_id
        and assets.profile_id = auth.uid()
    )
  );
