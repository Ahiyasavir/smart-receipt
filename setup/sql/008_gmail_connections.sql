-- Per-user Gmail connection for the email-ingestion channel.
--
-- SECURITY: refresh_token is a long-lived secret. RLS below restricts a user
-- to their own row, but this table should only ever be read with the SERVICE
-- ROLE key from the server-side fetcher — never exposed through the anon client.
-- (Frontend only needs to know connected = true/false, not the token.)
CREATE TABLE IF NOT EXISTS gmail_connections (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users NOT NULL UNIQUE,
  email_address  text,
  refresh_token  text NOT NULL,            -- OAuth refresh token (server-only)
  status         text NOT NULL DEFAULT 'connected', -- connected | error | revoked
  last_history_id text,                    -- Gmail historyId cursor (incremental)
  last_synced_at timestamptz,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_owns_gmail_connection"
  ON gmail_connections FOR ALL
  USING (auth.uid() = user_id);
