-- 0019_scpi_category.sql
-- Opes Wealth: make sure the "SCPI" asset category exists.
--
-- NOTE: `SCPI` has been seeded since 0001_initial_schema.sql, so on a project
-- that ran 0001 this is a no-op (on conflict do nothing). It is kept as an
-- idempotent safeguard for a project whose category table was seeded by hand
-- or has drifted (the same kind of drift found on asset_history's CHECK).
--
-- No new columns/tables: SCPI-specific fields (subscription price, entry fee,
-- withdrawal value, yield history, quarterly dividends…) live in
-- `assets.metadata` — see `src/lib/scpi.ts`.

insert into public.asset_categories (name, slug) values
  ('SCPI', 'scpi')
on conflict (slug) do nothing;
