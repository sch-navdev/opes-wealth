-- 2026-10-06: correct the stored figures of Steve's "2015 Porsche 911 Carrera".
-- Run in the Supabase SQL editor (project lpaollycwokxejrihrap). NOT run by Claude.
--
-- Asset  : 30ec417e-4650-4cc9-b69c-0363f4c2a12c   (owner row: Steve Haro 50% creator, Claude Haro 50%)
-- Stored amounts are for the WHOLE car in the asset currency (AED); the dashboard shows each
-- owner's 50% share. So the figures below are whole-car figures.
--
-- BEFORE : purchase_price 127500 | market_valuation 26013 | current_value 336245.39 (AED)
--          history 2026-10-02 = 336245.39
--          (336245.39 AED is exactly the Blue Book EUR 81,240 at 4.138914 AED/EUR: the Blue Book
--           figure had been stored as the headline value.)
-- AFTER  : purchase_price 225000 AED (Steve's figure)
--          market_valuation = current_value = 413890 AED = about EUR 100,000 at 4.1389 AED/EUR
--          (Steve's "around EUR 100,000"; change the rate/amount in the two places marked RATE
--           if you want a different one)
-- UNTOUCHED: the Blue Book log (EUR 81,240, Argus, 2026-09-29), mileage, expenses, depreciation.
--
-- NOTE: a direct SQL edit bypasses the app's co-owner approval flow; Claude Haro is not asked
-- to approve and is not e-mailed. If you prefer that, edit the car in the app instead.

-- 1) Safety check. Expect exactly ONE row, named "2015 Porsche 911 Carrera", currency AED.
select id, name, currency, current_value,
       metadata->>'purchase_price'   as purchase_price,
       metadata->>'market_valuation' as market_valuation
from public.assets
where id = '30ec417e-4650-4cc9-b69c-0363f4c2a12c'
  and profile_id = '3c5d31a6-1c2f-4a8d-856d-637b6f666a48';

-- 2) The fix: one row in public.assets.
update public.assets
set current_value = 413890,                                              -- RATE: 100000 EUR x 4.1389
    metadata      = metadata || jsonb_build_object(
                      'purchase_price',   225000,
                      'market_valuation', 413890                         -- RATE: same figure
                    ),
    updated_at    = now()
where id = '30ec417e-4650-4cc9-b69c-0363f4c2a12c'
  and profile_id = '3c5d31a6-1c2f-4a8d-856d-637b6f666a48'
  and name = '2015 Porsche 911 Carrera'
returning id, name, currency, current_value,
          metadata->>'purchase_price'   as purchase_price,
          metadata->>'market_valuation' as market_valuation;

-- 3) Keep the chart consistent: the asset's single history row (2026-10-02) still shows the old
--    336245.39. For vehicles net_equity equals value. Expect 1 row updated.
update public.asset_history
set value      = 413890,                                                 -- RATE: same figure
    net_equity = 413890
where asset_id = '30ec417e-4650-4cc9-b69c-0363f4c2a12c'
  and recorded_date = '2026-10-02'
returning asset_id, recorded_date, value, net_equity;

-- ROLLBACK (only if you need the old numbers back):
-- update public.assets
-- set current_value = 336245.39,
--     metadata = metadata || jsonb_build_object('purchase_price', 127500, 'market_valuation', 26013),
--     updated_at = now()
-- where id = '30ec417e-4650-4cc9-b69c-0363f4c2a12c';
-- update public.asset_history set value = 336245.39, net_equity = 336245.39
-- where asset_id = '30ec417e-4650-4cc9-b69c-0363f4c2a12c' and recorded_date = '2026-10-02';
