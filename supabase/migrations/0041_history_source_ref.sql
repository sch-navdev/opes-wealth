-- 0041_history_source_ref.sql
-- Opes Wealth: remember WHICH FILE an imported valuation / transaction came from, and tell PDF
-- statement imports apart from CSV imports in the Valuation Log.
--
-- DRAFT: not applied. Apply with `supabase db push` or paste into the SQL editor.
-- The app works before and after it (see `upsertHistoryRowsWithFallback` in
-- src/lib/market-data/cron-refresh.ts and `importBankTransactions`): without the columns the rows
-- are written without a file name; without 'pdf_import' in the CHECK the source falls back to 'manual'.
--
-- 1. asset_history.source_ref  : the imported file name (<= 200 chars), null for anything else.
-- 2. asset_history.source CHECK: newest definition (0020) + 'pdf_import'.
-- 3. transactions.source_file  : the imported file name (<= 200 chars). 0022 has no file column
--    (only `source`, the kind of import), so one is added.

alter table public.asset_history
  add column if not exists source_ref text;

alter table public.transactions
  add column if not exists source_file text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'asset_history_source_ref_len' and conrelid = 'public.asset_history'::regclass
  ) then
    alter table public.asset_history
      add constraint asset_history_source_ref_len
      check (source_ref is null or char_length(source_ref) <= 200);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_source_file_len' and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_source_file_len
      check (source_file is null or char_length(source_file) <= 200);
  end if;

  -- Widen the source CHECK: the full list of 0020_bank_connections.sql plus 'pdf_import'.
  alter table public.asset_history drop constraint if exists asset_history_source_check;
  alter table public.asset_history
    add constraint asset_history_source_check
    check (
      source in (
        'manual', 'dari', 'dubailand', 'csv_import', 'pdf_import', 'coingecko', 'finnhub',
        'yahoo', 'broker_import', 'vehicle_valuation', 'file_import', 'dld',
        'adrec', 'saxo', 'open_finance'
      )
    );
end
$$;

comment on column public.asset_history.source_ref is
  'File name of the import this row came from (csv_import / pdf_import); null otherwise.';
comment on column public.transactions.source_file is
  'File name of the statement this transaction was imported from.';
