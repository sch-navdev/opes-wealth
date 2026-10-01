-- 0017_precious_metals_category.sql
-- Opes Wealth: seed the "Precious Metals" asset category (gold / silver /
-- platinum bars and coins).
--
-- No new columns/tables: category-specific fields live in `assets.metadata`
-- (see `src/lib/precious-metals.ts`, same jsonb-per-category pattern as
-- Vehicles / Private Equity in 0009). Crypto already exists since 0001; its
-- wallet/exchange fields are metadata-only too.

insert into public.asset_categories (name, slug) values
  ('Precious Metals', 'precious-metals')
on conflict (slug) do nothing;
