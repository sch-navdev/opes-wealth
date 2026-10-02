-- 0026_client_knowledge.sql
-- Opes Wealth: remember the Client Knowledge Document (DCC) details between
-- sessions. One row per user holding the last entries they used in the DCC
-- dialog (civil status, KYC, tax, family, advisor, objectives) as JSON, so the
-- dialog opens pre-filled instead of empty.
--
-- PRIVACY: this stores personal data (it can include ID and tax numbers) in the
-- database, which the DCC deliberately did NOT do before. It is protected by
-- row-level security (a user can only ever touch their own row) and disk
-- encryption at rest by Supabase, but it is NOT application-level encrypted.
-- The wealth tables are never stored here: they are recomputed from the
-- portfolio each time. Users can delete their row from the dialog.
-- Idempotent: safe to re-run.

create table if not exists public.client_knowledge_documents (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.client_knowledge_documents enable row level security;

drop policy if exists "client_knowledge_select_own" on public.client_knowledge_documents;
create policy "client_knowledge_select_own"
  on public.client_knowledge_documents for select to authenticated
  using (auth.uid() = profile_id);

drop policy if exists "client_knowledge_insert_own" on public.client_knowledge_documents;
create policy "client_knowledge_insert_own"
  on public.client_knowledge_documents for insert to authenticated
  with check (auth.uid() = profile_id);

drop policy if exists "client_knowledge_update_own" on public.client_knowledge_documents;
create policy "client_knowledge_update_own"
  on public.client_knowledge_documents for update to authenticated
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

drop policy if exists "client_knowledge_delete_own" on public.client_knowledge_documents;
create policy "client_knowledge_delete_own"
  on public.client_knowledge_documents for delete to authenticated
  using (auth.uid() = profile_id);
