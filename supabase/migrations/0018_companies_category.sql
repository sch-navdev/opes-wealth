-- 0018_companies_category.sql
-- Opes Wealth: seed the "Companies" asset category (corporate entities and
-- business ownership held personally or through holding companies — distinct
-- from personal assets and from Private Equity fund commitments).
--
-- No new columns/tables: fields live in `assets.metadata` (see
-- `src/lib/companies.ts`). The Private Equity redesign (commitment, called
-- capital, capital-call schedule) is metadata-only too (`src/lib/private-equity.ts`).

insert into public.asset_categories (name, slug) values
  ('Companies', 'companies')
on conflict (slug) do nothing;
