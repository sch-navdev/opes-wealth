-- 0038_governance_vault.sql
-- Opes Wealth: Governance Vault. Documents (title deed, insurance, trust deed, ...) attached to an
-- asset, in a PRIVATE storage bucket, with expiry dates that raise bell notifications.
--
-- WRITTEN, NOT APPLIED. Steve applies this in the Supabase SQL editor. Until it is applied the app
-- keeps working: the Documents tab shows "not available yet" (42P01 / PGRST205 are swallowed).
--
-- Model:
--   * `profile_id` is the document's OWNER (the member who uploaded it). Any member of the asset
--     (creator or registered co-owner, see is_asset_member in 0025) may upload; the file lives in
--     that member's own folder: <profile_id>/<asset_id>/<uuid>-<name>.
--   * Co-owners can see a document unless `owner_only` is set. Only the owner can change or delete it.
--   * Files are NEVER readable by browser sessions of other users: storage.objects policies are
--     scoped to the owner's folder, and co-owners reach a file only through a 60 s signed URL that
--     a server action issues after checking the row (RLS) and writing the access log.
--   * document_access_log is append-only for the actor and readable by the document owner.
--   * Demo account: read-only (restrictive policies, as in 0032/0034).
--
-- Idempotent: safe to re-run.

-- =========================================================================
-- asset_documents
-- =========================================================================

create table if not exists public.asset_documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  doc_type text not null check (doc_type in ('deed', 'insurance', 'trust_deed', 'tax', 'valuation', 'id', 'contract', 'other')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg')),
  size_bytes integer not null check (size_bytes between 1 and 15728640),
  expires_on date,
  owner_only boolean not null default false,
  created_at timestamptz not null default now(),
  -- The path is built by the server as <owner>/<asset>/<file>; refuse anything else.
  constraint asset_documents_path_prefix check (storage_path like profile_id::text || '/' || asset_id::text || '/%')
);

create index if not exists asset_documents_asset_idx on public.asset_documents (asset_id, created_at desc);
create index if not exists asset_documents_profile_idx on public.asset_documents (profile_id);
create index if not exists asset_documents_expiry_idx on public.asset_documents (expires_on) where expires_on is not null;

alter table public.asset_documents enable row level security;

-- Owner: everything of theirs. Co-owner: rows of the asset that are not owner_only.
drop policy if exists "asset_documents_select" on public.asset_documents;
create policy "asset_documents_select"
  on public.asset_documents for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (public.is_asset_member(asset_id) and not owner_only)
  );

-- Upload: as yourself, to an asset you are a member of.
drop policy if exists "asset_documents_insert_own" on public.asset_documents;
create policy "asset_documents_insert_own"
  on public.asset_documents for insert to authenticated
  with check (profile_id = (select auth.uid()) and public.is_asset_member(asset_id));

drop policy if exists "asset_documents_update_own" on public.asset_documents;
create policy "asset_documents_update_own"
  on public.asset_documents for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and public.is_asset_member(asset_id));

drop policy if exists "asset_documents_delete_own" on public.asset_documents;
create policy "asset_documents_delete_own"
  on public.asset_documents for delete to authenticated
  using (profile_id = (select auth.uid()));

-- Column-level guard: a browser session may only change these four columns (never the path, owner,
-- asset, mime type or size).
revoke update on public.asset_documents from anon, authenticated;
grant update (title, doc_type, expires_on, owner_only) on public.asset_documents to authenticated;

drop policy if exists demo_readonly_insert on public.asset_documents;
drop policy if exists demo_readonly_update on public.asset_documents;
drop policy if exists demo_readonly_delete on public.asset_documents;
create policy demo_readonly_insert on public.asset_documents as restrictive for insert to authenticated with check (not public.is_demo_user());
create policy demo_readonly_update on public.asset_documents as restrictive for update to authenticated using (not public.is_demo_user()) with check (not public.is_demo_user());
create policy demo_readonly_delete on public.asset_documents as restrictive for delete to authenticated using (not public.is_demo_user());

-- =========================================================================
-- document_access_log (append-only audit trail)
-- =========================================================================

create table if not exists public.document_access_log (
  id bigint generated always as identity primary key,
  -- set null (not cascade) so the 'delete' entry survives the row it describes.
  document_id uuid references public.asset_documents (id) on delete set null,
  -- Denormalised document owner, so the owner can still read the log after the document is gone.
  owner_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('view', 'download', 'upload', 'delete')),
  at timestamptz not null default now()
);

create index if not exists document_access_log_document_idx on public.document_access_log (document_id, at desc);
create index if not exists document_access_log_owner_idx on public.document_access_log (owner_id, at desc);

alter table public.document_access_log enable row level security;

-- Insert only as yourself, and only for a document you can currently see (RLS applies inside the
-- subquery, so a co-owner cannot log against an owner_only document) whose owner matches.
drop policy if exists "document_access_log_insert_actor" on public.document_access_log;
create policy "document_access_log_insert_actor"
  on public.document_access_log for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and exists (
      select 1 from public.asset_documents d
      where d.id = document_id and d.profile_id = owner_id
    )
  );

-- Only the document owner reads the log.
drop policy if exists "document_access_log_select_owner" on public.document_access_log;
create policy "document_access_log_select_owner"
  on public.document_access_log for select to authenticated
  using (owner_id = (select auth.uid()));

-- No update / delete policy, and no grants: the log cannot be edited or erased from a browser session.
revoke update, delete on public.document_access_log from anon, authenticated;

drop policy if exists demo_readonly_insert on public.document_access_log;
create policy demo_readonly_insert on public.document_access_log as restrictive for insert to authenticated with check (not public.is_demo_user());

-- =========================================================================
-- Private storage bucket
-- =========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('governance-vault', 'governance-vault', false, 15728640, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Owner folder only: first path segment = auth.uid(). Co-owners never touch objects directly.
drop policy if exists "governance_vault_select_own_folder" on storage.objects;
create policy "governance_vault_select_own_folder"
  on storage.objects for select to authenticated
  using (bucket_id = 'governance-vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Insert: own folder AND the second segment must be an asset the uploader is a member of.
-- (CASE so the uuid cast never runs on a malformed segment.)
drop policy if exists "governance_vault_insert_own_folder" on storage.objects;
create policy "governance_vault_insert_own_folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'governance-vault'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and case
      when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then public.is_asset_member(((storage.foldername(name))[2])::uuid)
      else false
    end
  );

-- No update policy: objects are immutable (no upsert / overwrite).
drop policy if exists "governance_vault_delete_own_folder" on storage.objects;
create policy "governance_vault_delete_own_folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'governance-vault' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- The demo account is already denied on storage.objects by 0032 (restrictive policies).

-- =========================================================================
-- notifications: allow kind 'document_expiry' (+ once per document/threshold/expiry date)
-- Existing list in 0034: change_approved, change_rejected, change_auto_applied.
-- =========================================================================

do $$
begin
  if to_regclass('public.notifications') is not null then
    alter table public.notifications drop constraint if exists notifications_kind_check;
    alter table public.notifications
      add constraint notifications_kind_check
      check (kind in ('change_approved', 'change_rejected', 'change_auto_applied', 'document_expiry'));

    -- DB-level idempotence for the daily cron: one notification per (document, threshold, expiry date).
    -- Re-dating a document (renewal) produces a new expiry date and therefore fresh reminders.
    create unique index if not exists notifications_document_expiry_once
      on public.notifications ((data ->> 'document_id'), (data ->> 'threshold'), (data ->> 'expires_on'))
      where kind = 'document_expiry';
  end if;
end $$;
