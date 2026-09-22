-- 0009_vehicle_private_equity_categories.sql
-- Opes Wealth: seed two new asset categories (Vehicles, Private Equity).
--
-- No new columns/tables: this app stores category-specific fields in the
-- existing `assets.metadata` jsonb column (see `RealEstateMetadata` in
-- `src/lib/real-estate.ts` for the established pattern), not in per-category
-- tables. The corresponding TypeScript shapes for these two categories live
-- in `src/lib/vehicles.ts` and `src/lib/private-equity.ts`.

insert into public.asset_categories (name, slug) values
  ('Vehicles', 'vehicles'),
  ('Private Equity', 'private-equity')
on conflict (slug) do nothing;
