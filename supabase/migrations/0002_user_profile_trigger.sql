-- 0002_user_profile_trigger.sql
-- Opes Wealth: automatically create a `profiles` row for every new
-- `auth.users` row, so downstream inserts (e.g. `assets.profile_id`) never
-- hit a foreign-key violation for a signed-up user.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
