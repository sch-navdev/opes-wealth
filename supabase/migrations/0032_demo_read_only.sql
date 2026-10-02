-- 0032_demo_read_only.sql
-- Opes Wealth: the public demo account (demo@opeswealth.com, password published on the
-- sign-in page) must be able to READ everything and CHANGE nothing.
--
-- RESTRICTIVE policies are ANDed with the existing (permissive) ones, so for this one
-- user INSERT, UPDATE and DELETE are refused on every public table and on storage
-- objects, whatever other policies say. SELECT is untouched. Other users are unaffected.
-- The service role bypasses RLS by design; the app guards its service-role paths
-- (src/lib/demo-mode.ts) and swallows the demo user's writes before they get here.
--
-- Demo user id: scripts/seed-demo.mts keeps it stable (it updates the existing user).
-- A different environment needs its own id here and in the DEMO_USER_ID env var.
--
-- RE-RUN this migration after adding a table: it loops over the tables that exist now.
-- Idempotent: safe to re-run.

create or replace function public.is_demo_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() = 'ddf92bf5-5beb-45c1-bf92-d3b696806d13'::uuid;
$$;

revoke execute on function public.is_demo_user() from public, anon;
grant execute on function public.is_demo_user() to authenticated, service_role;

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists demo_readonly_insert on public.%I', t.relname);
    execute format('drop policy if exists demo_readonly_update on public.%I', t.relname);
    execute format('drop policy if exists demo_readonly_delete on public.%I', t.relname);
    execute format('create policy demo_readonly_insert on public.%I as restrictive for insert to authenticated with check (not public.is_demo_user())', t.relname);
    execute format('create policy demo_readonly_update on public.%I as restrictive for update to authenticated using (not public.is_demo_user()) with check (not public.is_demo_user())', t.relname);
    execute format('create policy demo_readonly_delete on public.%I as restrictive for delete to authenticated using (not public.is_demo_user())', t.relname);
  end loop;
end
$$;

-- Photos: the storage bucket is covered the same way.
drop policy if exists demo_readonly_insert on storage.objects;
drop policy if exists demo_readonly_update on storage.objects;
drop policy if exists demo_readonly_delete on storage.objects;
create policy demo_readonly_insert on storage.objects as restrictive for insert to authenticated with check (not public.is_demo_user());
create policy demo_readonly_update on storage.objects as restrictive for update to authenticated using (not public.is_demo_user()) with check (not public.is_demo_user());
create policy demo_readonly_delete on storage.objects as restrictive for delete to authenticated using (not public.is_demo_user());
