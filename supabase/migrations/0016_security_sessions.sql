-- 0016_security_sessions.sql
-- Opes Wealth: let a signed-in user list and revoke their OWN Supabase Auth
-- sessions (the "Security" page, /dashboard/security).
--
-- Supabase's JS client has no "list my sessions" API, and the `auth` schema is
-- not exposed through PostgREST. These two SECURITY DEFINER functions are the
-- narrow, user-scoped bridge: both filter on `auth.uid()`, so a caller can only
-- ever see or delete rows belonging to themselves.
--
-- Deleting a row from `auth.sessions` cascades to `auth.refresh_tokens`, so the
-- device can no longer refresh. Its already-issued access token (JWT) stays
-- valid until it expires (Supabase default: 1 hour) — that is inherent to JWTs.
--
-- Apply with `supabase db push` or paste into the SQL editor.

create or replace function public.list_my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  aal text,
  is_current boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    s.id,
    s.created_at,
    coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) as last_active_at,
    s.user_agent,
    s.ip::text,
    s.aal::text,
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '') as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
  order by coalesce(s.refreshed_at at time zone 'utc', s.updated_at, s.created_at) desc;
$$;

create or replace function public.revoke_my_session(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from auth.sessions
  where id = p_session_id
    and user_id = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.list_my_sessions() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
