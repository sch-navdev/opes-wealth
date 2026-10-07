-- 0036_assurance_vie_category.sql
-- Opes Wealth: seed the "Assurance-Vie" asset category (French life-insurance
-- savings contracts: euro fund + unit-linked allocation, premiums, beneficiaries
-- and the 8-year milestone).
--
-- No new columns/tables: contract details live in `assets.metadata` (versioned
-- jsonb object, see `src/lib/assurance-vie.ts`). The asset value is the total
-- contract value entered by the user (no live pricing, no unit-of-account lines).

insert into public.asset_categories (name, slug) values
  ('Assurance-Vie', 'assurance-vie')
on conflict (slug) do nothing;
