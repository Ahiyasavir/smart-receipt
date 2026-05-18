-- Fix: ON CONFLICT (user_id, external_id) needs a NON-partial unique index as
-- its arbiter. Migration 002 created a partial index (WHERE external_id IS NOT
-- NULL), which Postgres will not accept for the upsert conflict target — so
-- every idempotent bank/email/CSV insert fails.
--
-- A plain unique index works correctly here: Postgres treats NULLs as
-- distinct, so scanned receipts (external_id IS NULL) can still have unlimited
-- rows, while bank/email/CSV rows dedupe on (user_id, external_id).

drop index if exists receipts_external_id_user_id;

create unique index if not exists receipts_user_external_id_uniq
  on receipts (user_id, external_id);
