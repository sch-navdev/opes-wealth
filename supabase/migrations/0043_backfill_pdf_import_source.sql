-- 0043_backfill_pdf_import_source.sql
-- Opes Wealth: statements imported before the CSV / PDF distinction (0041) were all recorded as 'csv_import',
-- but every one uploaded so far was a PDF. Re-tag them so the Banking tab and the Valuation Log say
-- "PDF statement" without re-uploading anything.
--
-- A row whose recorded file name ends in .csv keeps 'csv_import'. Idempotent: safe to run twice.

update public.asset_history
   set source = 'pdf_import'
 where source = 'csv_import'
   and (source_ref is null or source_ref !~* '\.csv$');

update public.transactions
   set source = 'pdf_import'
 where source = 'csv_import'
   and (source_file is null or source_file !~* '\.csv$');
