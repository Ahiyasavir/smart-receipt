-- Run this in the Supabase SQL editor to add bank-sync columns.
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

alter table receipts
  add column if not exists external_id text,       -- bank transaction ID for dedup
  add column if not exists source      text;        -- 'scan' | 'bank-sync' | 'bank-import'

-- Unique constraint so duplicate bank transactions are rejected
create unique index if not exists receipts_external_id_user_id
  on receipts (user_id, external_id)
  where external_id is not null;
