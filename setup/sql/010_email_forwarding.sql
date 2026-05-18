-- Pivot from PULL (Gmail OAuth + cron) to PUSH (inbound email webhook).
-- We no longer store OAuth tokens. The forwarding address is derived from the
-- user id, so all we keep is a lightweight "this user has forwarding active"
-- record updated by the inbound webhook.

alter table gmail_connections
  drop column if exists refresh_token,
  drop column if exists last_history_id;

alter table gmail_connections
  add column if not exists forwarding_enabled boolean not null default true,
  add column if not exists last_received_at   timestamptz;

-- Old polling cursor is meaningless in the push model.
alter table gmail_connections
  drop column if exists last_synced_at;
