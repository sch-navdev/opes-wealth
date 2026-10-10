-- 0042_income_employer.sql
-- Opes Wealth: income streams per EMPLOYER and a 'gratuity' kind.
--
-- WRITTEN, NOT APPLIED. Steve applies this in the Supabase SQL editor. Until it is applied the app keeps
-- working: the employer link is simply not stored (the stream keeps its free-text source_name) and the
-- Gratuity type is not offered by the database (the form falls back to Other).
--
-- employer_asset_id: the Company / entity (an asset of the Companies category) that pays the stream, so
-- salary, bonus and gratuity from several employers can be grouped. null = an employer that is not one
-- of the user's own companies (its name stays in source_name). on delete set null: deleting the company
-- keeps the stream.
--
-- Idempotent: safe to re-run.

alter table public.income_streams
  add column if not exists employer_asset_id uuid references public.assets (id) on delete set null;

create index if not exists income_streams_employer_idx
  on public.income_streams (employer_asset_id);

comment on column public.income_streams.employer_asset_id is
  'Company / entity asset that pays this stream (null = an outside employer, named in source_name).';

-- Widen the kind check to include the end-of-service gratuity.
alter table public.income_streams drop constraint if exists income_streams_kind_check;
alter table public.income_streams
  add constraint income_streams_kind_check
  check (kind in ('salary', 'bonus', 'gratuity', 'freelance', 'rental', 'pension', 'dividend_other', 'other'));
