-- 0003_profile_extended_fields.sql
-- Opes Wealth: extend `profiles` with contact/address fields and a Base64
-- profile picture, needed by the Profile Settings page.

alter table public.profiles
  add column if not exists phone_number text,
  add column if not exists address_street text,
  add column if not exists address_po_box text,
  add column if not exists address_city text,
  add column if not exists address_postal_code text,
  add column if not exists address_landmark text,
  add column if not exists address_country text,
  add column if not exists avatar_base64 text;
