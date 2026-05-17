# Edge Functions — Gmail email-ingestion deployment

Two functions power the email-alert sync channel:

| Function | Role |
|---|---|
| `google-oauth-callback` | One-time: exchanges the OAuth code, stores the per-user `refresh_token` |
| `gmail-sync` | Scheduled worker: polls inboxes, ingests bank-alert emails idempotently |

## 1. Database

Apply migrations in order (adds `gmail_connections` + `currency` + `source` backfill):

```bash
# 005_bank_connections, 006_currency, 007_backfill_source, 008_gmail_connections
psql "$SUPABASE_DB_URL" -f setup/sql/008_gmail_connections.sql
```

## 2. Supabase Secrets

```bash
supabase secrets set \
  GOOGLE_CLIENT_ID=<google-oauth-client-id> \
  GOOGLE_CLIENT_SECRET=<google-oauth-client-secret> \
  SUPABASE_URL=<https://xxxx.supabase.co> \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

> `SUPABASE_SERVICE_ROLE_KEY` and `GOOGLE_CLIENT_SECRET` are server-only —
> never set as `VITE_*` and never shipped to the browser.

Frontend env (build-time, public, safe):

```
VITE_GOOGLE_CLIENT_ID=<same google-oauth-client-id>
```

## 3. Google Cloud Console

1. **APIs & Services → Library:** enable **Gmail API**.
2. **OAuth consent screen:**
   - User type: External
   - Scope: `https://www.googleapis.com/auth/gmail.readonly` **only**
   - Add test users (until the app is verified by Google).
3. **Credentials → Create OAuth client ID → Web application:**
   - **Authorized redirect URIs:**
     - `https://<your-app-domain>/oauth/google/callback`
     - `http://localhost:5173/oauth/google/callback` (dev)
   - Copy the Client ID + Secret into the secrets above.

## 4. Deploy

```bash
supabase functions deploy google-oauth-callback --no-verify-jwt
supabase functions deploy gmail-sync          --no-verify-jwt
```

`--no-verify-jwt` is required: `google-oauth-callback` verifies the user via the
forwarded bearer token itself, and `gmail-sync` runs from cron with the service
role.

## 5. Schedule the worker

Run `gmail-sync` with **no body** to sync all connected users. Add to the
existing bank-sync cadence via `pg_cron`:

```sql
select cron.schedule(
  'gmail-sync-hourly', '0 * * * *',
  $$ select net.http_post(
       url     := '<SUPABASE_URL>/functions/v1/gmail-sync',
       headers := jsonb_build_object(
         'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
         'Content-Type',  'application/json'),
       body    := '{}'::jsonb
     ); $$
);
```

The OAuth callback also fire-and-forgets a single-user `gmail-sync`
(`{ "userId": "...", "sinceHours": 24 }`) for an instant first backfill.

## Idempotency / safety notes

- `external_id = email_<djb2(messageId|timestamp|amount|merchantKey)>`;
  upsert uses `onConflict: 'user_id,external_id', ignoreDuplicates: true`, so
  re-runs and overlapping windows never duplicate transactions.
- `last_synced_at` advances **only after** a successful batch — a failed run
  retries the same window next cycle.
- Per-user failures are isolated in the cron loop (one bad token can't block
  the rest); the user's row is flagged `status = 'error'`.
- Scope is read-only; the restrictive `is:unread from:<bank senders>` query
  means non-bank email is never downloaded.
