-- Add bank-sync deduplication columns

alter table receipts
  add column if not exists external_id text,
  add column if not exists source      text;

create unique index if not exists receipts_external_id_user_id
  on receipts (user_id, external_id)
  where external_id is not null;
