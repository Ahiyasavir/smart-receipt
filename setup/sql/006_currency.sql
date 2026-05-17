-- Per-transaction currency (ISO 4217). Receipts/transactions can each carry
-- their own currency; absent means "use the user's display currency".
alter table receipts
  add column if not exists currency text;
