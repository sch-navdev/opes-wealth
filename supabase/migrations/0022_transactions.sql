-- 0022_transactions.sql
-- Opes Wealth: persisted bank transactions with a content fingerprint, so a
-- re-imported (or overlapping) CSV/statement never creates duplicate entries.
--
-- Until now an import only wrote one balance point per day to asset_history
-- (idempotent on asset_id + recorded_date) and discarded the individual
-- transactions. This table keeps them. `fingerprint` is a SHA-256 of the
-- transaction's date, amount, currency and normalised description (plus an
-- occurrence counter so two genuinely identical same-day payments in ONE file
-- both survive — see src/lib/transactions.ts). The unique (profile_id,
-- fingerprint) constraint is what the import upserts against.
--
-- The user column is `profile_id` (the project's convention, == auth.uid()).
-- Apply with `supabase db push` or paste into the SQL editor.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  asset_id uuid not null references public.assets (id) on delete cascade,
  fingerprint text not null,
  booked_date date not null,
  -- Signed: positive = money in.
  amount numeric not null,
  currency text not null,
  description text not null default '',
  source text not null default 'csv_import',
  created_at timestamptz not null default now(),
  constraint transactions_profile_fingerprint_key unique (profile_id, fingerprint)
);

create index if not exists transactions_asset_date_idx
  on public.transactions (asset_id, booked_date desc);

alter table public.transactions enable row level security;

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own"
  on public.transactions for select to authenticated
  using (auth.uid() = profile_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own"
  on public.transactions for insert to authenticated
  with check (auth.uid() = profile_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own"
  on public.transactions for delete to authenticated
  using (auth.uid() = profile_id);
