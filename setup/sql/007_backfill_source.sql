-- Backfill `source` for bank rows imported before addReceipt persisted it.
-- external_id shape: '<bankId>_csv_...'  → CSV/manual import
--                    '<bankId>_<acct>_..' → automated scraper sync
update receipts
   set source = 'bank-import'
 where source is null
   and external_id is not null
   and external_id like '%\_csv\_%';

update receipts
   set source = 'bank-sync'
 where source is null
   and external_id is not null
   and external_id not like '%\_csv\_%';

-- Everything else without an external_id is an OCR scan.
update receipts
   set source = 'scan'
 where source is null;
