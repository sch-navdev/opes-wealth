-- 0030_session_locations.sql
-- Opes Wealth: where each signed-in session really is (Security page).
--
-- Supabase Auth records the IP and user agent it SEES. Because sign-in happens in
-- server code on Vercel, that is the server's address and "node", not the user's
-- computer. The app therefore records the real client IP, user agent and the
-- city/country that Vercel derives from the request, once per session, keyed by the
-- session id (the `session_id` claim of the access token).
--
-- Written only by the server with the service role; a user can read only their own
-- rows. Rows of ended sessions are removed when the Security page loads.
-- Idempotent: safe to re-run.

create table if not exists public.session_locations (
  session_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  ip text,
  country text,   -- ISO 3166-1 alpha-2, e.g. 'AE'
  city text,
  region text,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists session_locations_user_idx on public.session_locations (user_id);

alter table public.session_locations enable row level security;

drop policy if exists "session_locations_select_own" on public.session_locations;
create policy "session_locations_select_own"
  on public.session_locations for select to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policies: only the service role writes.
