-- 0024_startups_category.sql
-- Opes Wealth: seed the "Startups" asset category (unlisted companies: direct
-- equity, SAFEs, convertible notes, BSPCE / stock options).
--
-- No new columns/tables: the fields (company, sector, investment type, average
-- cost per share, funding rounds) live in `assets.metadata` and `assets.quantity`
-- holds the number of shares — see `src/lib/startups.ts`.

insert into public.asset_categories (name, slug) values
  ('Startups', 'startups')
on conflict (slug) do nothing;
