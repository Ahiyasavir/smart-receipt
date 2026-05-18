-- Productization: per-user, non-guessable inbound sync identity.
--
-- Before: the public forwarding address embedded the raw auth user_id
-- (sync+<uuid>@…) — an internal identifier leak and not revocable.
-- After: a random `bank_sync_alias` decouples the public address from the
-- user id, is non-guessable, and can be regenerated to revoke a leaked one.
-- Resolution is alias → user_id (service role, server-side only).

alter table gmail_connections
  add column if not exists bank_sync_alias text,
  add column if not exists alias_rotated_at timestamptz;

-- Backfill existing rows with a random alias (24 hex chars, ~96 bits).
update gmail_connections
   set bank_sync_alias = encode(gen_random_bytes(12), 'hex')
 where bank_sync_alias is null;

-- One alias ↔ one user; fast lookup path for the webhook.
create unique index if not exists gmail_connections_alias_uniq
  on gmail_connections (bank_sync_alias)
  where bank_sync_alias is not null;

-- RLS already restricts a user to their own row (user_owns_gmail_connection
-- FOR ALL USING auth.uid() = user_id); the webhook reads via service role.
