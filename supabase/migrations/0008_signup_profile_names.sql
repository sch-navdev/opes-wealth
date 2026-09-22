-- 0008_signup_profile_names.sql
-- Populates profiles.first_name/last_name from auth.users.raw_user_meta_data
-- at signup time, so the registration form's First/Last Name fields land in
-- the profile row immediately instead of requiring a follow-up edit.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  );

  return new;
end;
$$;
