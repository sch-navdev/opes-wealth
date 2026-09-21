-- 0005_asset_image.sql
-- Opes Wealth: a per-asset image/logo (Base64), shown as a small avatar
-- next to the asset's name in the portfolio table.

alter table public.assets
  add column if not exists image_base64 text;
