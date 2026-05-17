-- Bank connection records — tracks which banks a user has configured/imported from.
-- No credentials are stored here; credentials live in GitHub Secrets for the auto-sync
-- scraper, or are never stored at all when the user uses manual CSV import.
CREATE TABLE IF NOT EXISTS bank_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users NOT NULL,
  bank_id           text NOT NULL,          -- 'hapoalim' | 'leumi' | 'discount' | …
  bank_name         text NOT NULL,
  status            text NOT NULL DEFAULT 'csv_imported', -- csv_imported | auto_sync | error | disconnected
  last_sync         timestamptz,
  transaction_count integer NOT NULL DEFAULT 0,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, bank_id)
);

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_owns_bank_connections"
  ON bank_connections FOR ALL
  USING (auth.uid() = user_id);

-- Merchant category overrides — user corrections persist per merchant key.
-- When a user re-categorises a bank transaction, the new category is saved here
-- and applied automatically to future transactions from the same merchant.
CREATE TABLE IF NOT EXISTS merchant_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users NOT NULL,
  merchant_key text NOT NULL,   -- normalised lowercase key, e.g. "shufersal"
  category     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, merchant_key)
);

ALTER TABLE merchant_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_owns_merchant_overrides"
  ON merchant_overrides FOR ALL
  USING (auth.uid() = user_id);
