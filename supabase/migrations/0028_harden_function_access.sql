-- 0028_harden_function_access.sql
-- Opes Wealth: stop exposing two SECURITY DEFINER helpers from migration 0025
-- through the public REST API (/rest/v1/rpc/...), as flagged by the Supabase
-- security advisor.
--
--   is_asset_member(uuid)       Used inside row-level-security policies, so SIGNED-IN
--                               users must keep EXECUTE (policies are evaluated with
--                               the caller's privileges). Signed-out visitors
--                               (anon / public) no longer may call it.
--   link_pending_co_owners()    A trigger function on public.profiles. Postgres checks
--                               EXECUTE when a trigger is created, not each time it
--                               fires, so nobody needs to be able to call it directly.
--
-- Not touched on purpose: handle_new_user and rls_auto_enable (older, outside this
-- change) and list_my_sessions / revoke_my_session (meant to be callable by signed-in
-- users). Idempotent: safe to re-run.

revoke execute on function public.is_asset_member(uuid) from public, anon;
grant execute on function public.is_asset_member(uuid) to authenticated, service_role;

revoke execute on function public.link_pending_co_owners() from public, anon, authenticated;
