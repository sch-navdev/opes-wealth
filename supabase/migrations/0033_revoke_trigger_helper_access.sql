-- 0033_revoke_trigger_helper_access.sql
-- Opes Wealth: stop exposing two trigger helpers through the public REST API
-- (/rest/v1/rpc/...), as flagged by the Supabase security advisor after 0028.
--
--   handle_new_user()   Trigger function behind `on_auth_user_created` on auth.users
--                       (creates the profile row at sign-up).
--   rls_auto_enable()   Function behind the `ensure_rls` event trigger (turns on row
--                       level security for newly created tables).
--
-- Postgres checks EXECUTE on a trigger / event-trigger function when the trigger
-- is CREATED, not each time it fires, so nobody needs to be able to call these
-- directly. The application never calls either through RPC (verified by grep:
-- no `.rpc("handle_new_user")` / `.rpc("rls_auto_enable")`). service_role keeps
-- its grant. Idempotent: safe to re-run.
--
-- Applied by Steve in the Supabase SQL editor on 2026-10-06 (verified afterwards:
-- anon/authenticated can no longer execute either; `on_auth_user_created` and
-- `ensure_rls` are still attached and enabled).

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
