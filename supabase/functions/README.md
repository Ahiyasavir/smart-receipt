# Edge Functions — Email ingestion (PUSH / inbound webhook)

Architecture is **push-based**. The user auto-forwards bank alert emails to a
unique address; an email provider POSTs them to one Edge Function. No Gmail
OAuth, no `refresh_token`s, no cron polling, no `gmail.readonly` audit, zero
server load when there are no transactions.

| Function | Role |
|---|---|
| `inbound-email-webhook` | Receives forwarded bank alerts, parses, idempotently stores |

> Removed in the pivot: `gmail-sync`, `google-oauth-callback` (and the cron).

## 1. Database

Apply migrations in order through `010`:

```bash
psql "$SUPABASE_DB_URL" -f setup/sql/010_email_forwarding.sql
```

`010` drops the OAuth token columns and adds `forwarding_enabled` +
`last_received_at` to `gmail_connections`.

## 2. Supabase Secrets

```bash
supabase secrets set \
  SUPABASE_URL=<https://xxxx.supabase.co> \
  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  INBOUND_WEBHOOK_SECRET=<long-random-string>
```

`INBOUND_WEBHOOK_SECRET` gates the endpoint (sent as `?token=` query param or
`x-webhook-secret` header) so nobody can inject fake transactions.

No `GOOGLE_*` secrets needed anymore — safe to delete them.

Frontend env (public, build-time):

```
VITE_INBOUND_EMAIL_DOMAIN=inbound.smartreceipt.app
```

## 3. Email provider (SendGrid Inbound Parse — recommended free path)

1. Pick a domain/subdomain, e.g. `inbound.smartreceipt.app`.
2. SendGrid → Settings → **Inbound Parse** → Add Host & URL:
   - Receiving domain: `inbound.smartreceipt.app`
   - Destination URL:
     `https://<project>.supabase.co/functions/v1/inbound-email-webhook?token=<INBOUND_WEBHOOK_SECRET>`
   - Enable "POST the raw, full MIME message" is **not** required — default
     parsed fields (`to`, `text`, `html`, `headers`, `envelope`) are used.
3. Add the MX record SendGrid gives you for that domain
   (`mx.sendgrid.net`). Cloudflare Email Routing works too (POST JSON).

The webhook accepts SendGrid form-data **and** generic JSON, so either provider
works without code changes.

## 4. Deploy

```bash
supabase functions deploy inbound-email-webhook --no-verify-jwt
# remove the retired pull-model functions:
supabase functions delete gmail-sync
supabase functions delete google-oauth-callback
```

## 5. Decommission the old pull model

```sql
-- stop the old hourly poller
select cron.unschedule('gmail-sync-hourly');
```

The `GMAIL_TEST_SENDER` secret is also obsolete now — `supabase secrets unset
GMAIL_TEST_SENDER`.

## 6. User setup (in-app)

Settings → **Auto-track via email** shows the user their unique address
`sync+<user_id>@<domain>` and a 3-step Gmail-filter guide
(copy address → create filter → forward bank senders to it).

## How it stays correct

- **Idempotent:** `external_id = email_<djb2(messageId | date | amount |
  merchantKey)>`, upsert `onConflict (user_id, external_id) ignoreDuplicates` —
  re-forwarded / re-delivered mail never duplicates.
- **User resolution:** `user_uuid` is parsed from the `sync+<uuid>@` recipient
  and FK-validated by `receipts.user_id → auth.users` (a bad uuid is rejected).
- **Secret-gated:** unauthorized POSTs get 401.
- **Same pipeline:** identical normalization + category overrides + parser as
  CSV import and the bank scraper (twin of `src/services/emailIngestion.ts`).
- **Graceful:** unknown email formats are acked but skipped (never guessed);
  the app works fully without this channel.
