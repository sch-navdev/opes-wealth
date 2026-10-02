-- 0023_exotic_assets_category.sql
-- Opes Wealth: seed the "Exotic Assets" asset category (luxury watches and
-- other collectibles). No new columns/tables: the fields (brand, model,
-- reference, condition, purchase price, last market value…) live in
-- `assets.metadata` — see `src/lib/exotic-assets.ts`.

insert into public.asset_categories (name, slug) values
  ('Exotic Assets', 'exotic-assets')
on conflict (slug) do nothing;
