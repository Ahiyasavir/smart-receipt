-- Add email_digest opt-in to budgets table (one row per user_id)
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS email_digest BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_deadline_alerts BOOLEAN NOT NULL DEFAULT true;

-- Add return_deadline to receipts (persisted per-receipt)
ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS return_deadline DATE;
