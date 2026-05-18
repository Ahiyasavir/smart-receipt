# Spendora — Project Guide for Claude

> **Brand:** the product is **Spendora** (premium spending-insights, not a
> "receipt scanner"). Logo: `public/spendora-logo.png` (horizontal wordmark;
> use `dark:brightness-0 dark:invert` on dark backgrounds). Accent: teal
> (`teal-700` / theme `#155E63`). Positioning: "Automatically track, organize,
> and understand your spending." Visible copy uses *spending / transactions /
> activity / insights* — never receipt-first.
> **Do NOT rename internal `smartreceipt_*` localStorage keys or the
> `inbound.smartreceipt.app` fallback** — they are data-continuity / infra
> identifiers, not brand surfaces.



A PWA that tracks spending from **two independent input channels**:
1. **OCR receipt scanning** (camera/photo → parsed items) — the original feature.
2. **Bank/card transaction ingestion** — CSV import, an Israeli-bank scraper, and
   an email-forwarding webhook.

The product goal is **spending insight**, not just receipts. Receipt scanning is
one source; automatic transaction ingestion is the main one.

## Golden rules (do not violate)

1. **Keep the build GREEN at every step.** After any change run
   `npx tsc --noEmit` **and** `npm run build`. Never commit/deploy red.
2. **Never break receipt scanning or CSV import.** They must work with zero
   backend/config. Bank/email sync is strictly additive and degrades gracefully.
3. **No secrets in the frontend.** Service-role keys, OAuth secrets, webhook
   secrets live only in Supabase function secrets / server env. The browser only
   gets `VITE_*` public values. Never paste secrets into chat or commits.
4. **No fake data, no fabricated precision.** Unknown email/OCR formats are
   skipped, never guessed. Bank data is transaction-level — do not invent
   item-level receipt detail.
5. **Idempotency is sacred.** Every ingested transaction has a deterministic
   `external_id`; upserts use `onConflict: 'user_id,external_id',
   ignoreDuplicates: true`. Re-runs/re-sends must never duplicate.
6. **Extend, don't rewrite.** The normalize→categorize→store pipeline is shared
   across all channels — reuse it.
7. **Verify, don't assume.** Prefer a real run (tsc, build, live curl,
   screenshot) over claiming something works.

## Architecture

```
INPUT CHANNELS                     SHARED PIPELINE                 STORAGE
─────────────                      ───────────────                 ───────
OCR scan ───────────┐
CSV import ─────────┤   normalizeMerchantName → classifyCategory   receipts
bank scraper ───────┤   → merchant_overrides applied → djb2        (Supabase,
email webhook ──────┘   external_id → idempotent upsert            RLS by user)
```

- **Frontend:** React + TypeScript + Vite, `vite-plugin-pwa`
  (`registerType: 'autoUpdate'` — stale SW can serve old bundle; a hard reload
  / closing all tabs is sometimes needed after deploy). Tailwind. Hosted on
  Netlify (`smartreceipt.netlify.app`), builds from `main`.
- **Backend:** Supabase (Postgres + RLS + Edge Functions, Deno). Project ref
  `krtcjxkronmxribkccab`.
- **Auth:** Supabase email/password. `Settings` tab (and bank/email features)
  require sign-in.

### Key source files
- `src/App.tsx` — root; wires hooks, tabs, modals. Hook calls must precede the
  effects that use them (TDZ bites here).
- `src/utils/merchantNormalizer.ts` — canonical merchant cleaner + stable
  `merchantKey`. **Server twin:** `scraper/lib/merchant.mjs`.
- `src/utils/categoryClassifier.ts` — deterministic keyword/merchant categories.
- `src/services/emailIngestion.ts` — **canonical** alert parser + djb2
  `external_id`. The Edge Function carries an equivalent twin (see below).
- `src/hooks/useReceipts.ts` — `addReceipt` is idempotent when `externalId` is
  set (returns whether a row was actually inserted).
- `src/hooks/useMerchantOverrides.ts` — user category corrections, keyed by
  `merchantKey`, applied to future ingested transactions.
- `src/components/EmailSetupGuide.tsx` — onboarding for the email channel.
- `scraper/sync.mjs` + `.github/workflows/bank-sync.yml` — Israeli-bank scraper
  (GitHub Actions, credentials in GitHub Secrets only; guarded with
  `process.exit(0)` when unconfigured).
- `supabase/functions/inbound-email-webhook/` — current email ingestion.
- `setup/sql/0XX_*.sql` — migrations, applied **in order** via the Supabase SQL
  editor (no automated migrate step in prod).

### Per-user identity (since productization)
Public forwarding address is `sync_<bank_sync_alias>@<domain>` — a random,
non-guessable token (migration `011`), **not** the raw auth uid. The webhook
resolves alias → user_id server-side; legacy `sync+<uuid>@` still works
(backward compat — do not remove). `useBankSync` provisions/rotates the alias
and exposes connected/last-received state; `EmailSetupGuide` is the
no-jargon connection-management UI (status, copy, regenerate, pause).
Regenerating the alias revokes the old address; `forwarding_enabled=false`
pauses without data loss.

### Email ingestion is PUSH (since Stage 17)
The OAuth + hourly-cron PULL model was removed (avoids the $15k
`gmail.readonly` audit and all polling load). Now: user auto-forwards bank
alerts to `sync+<user_id>@<domain>`; an email provider (SendGrid Inbound Parse /
Cloudflare / Make.com Mailhook / Pipedream — all have free, no-domain options)
POSTs to `inbound-email-webhook`. The function is **secret-gated**
(`INBOUND_WEBHOOK_SECRET` via `?token=` or `x-webhook-secret`), resolves the
user from the recipient address (FK-validated by `receipts.user_id`), and runs
the shared pipeline. Zero server load when idle.

## Text sanitization (Phase 4)

All channels MUST pre-parse through the one canonical sanitizer before any
regex/classification, so behaviour can't drift:
- `src/utils/textSanitize.ts` — `sanitizeText()` (NFC → strip BiDi/zero-width
  /soft-hyphen → decode HTML entities → exotic-whitespace → repair broken
  wraps → collapse) + `ParseFailReason`.
- Twin: the `sanitize()` block in `supabase/functions/inbound-email-webhook`.
- `parseAlertEmailDetailed()` returns `{ alert, reason }`; the webhook echoes
  `reason` in `{ok:true,parsed:false,reason}` and logs a PII-free
  `{evt:'parse_skip',reason,bodyLen}` line. Regexes with invisible Unicode
  MUST use explicit `\uXXXX` escapes (never literal invisibles).

## "Twin module" discipline

Deno Edge Functions cannot resolve the extensionless cross-`src/` import chain,
so server functions are **self-contained** and carry a twin of the parser /
normalizer / classifier / djb2. When you change parsing or normalization,
update **both**:
- `src/services/emailIngestion.ts` + `src/utils/merchantNormalizer.ts`
- `supabase/functions/inbound-email-webhook/index.ts`
- `scraper/lib/merchant.mjs` (+ `scraper/sync.mjs` classifier)
Keep logic byte-equivalent so `merchant_overrides` and `external_id` stay
consistent across channels.

## Hard-won gotchas (don't relearn these)

- **Email bodies are UTF-8.** A bare `atob()` yields Latin-1 mojibake and
  breaks all Hebrew regexes. Always decode base64url → bytes →
  `TextDecoder('utf-8')`; also strip bidi/zero-width marks and decode HTML
  entities; collapse `\s+` (handles wrapped lines like `PAZ\nGAS STATION`).
- **Alert parsing must be order-independent.** Hebrew alerts vary wildly —
  extract amount / merchant / date *independently*, tolerate filler text and
  `350` vs `350.00`. One rigid ordered regex will miss real emails.
- **Receipts load once on mount.** New rows need an app refresh to appear.
- **`addReceipt` previously dropped `source`/`external_id`** → bank rows lost
  attribution on reload and duplicated. They are now persisted; keep it that
  way.
- **`ON CONFLICT (user_id, external_id)` needs a NON-partial unique index**
  (migration `009`). A partial index is not a valid arbiter.
- **Don't paste secrets in chat.** A service-role key was leaked once and had
  to be rotated. Treat any shared secret as compromised.
- **PR timing:** fixes pushed after a PR merged left `main` stale; merge
  conflicts came from earlier hotfix PRs. Verify `mergeable` state via API
  before claiming a merge.

## Commands

```bash
npx tsc --noEmit          # typecheck (src only; supabase/ & scraper/ excluded)
npm run build             # tsc + vite build — must pass before commit/deploy
npm run dev               # local dev (preview server on :5173)
# Edge function deploy (CLI already authed; pass --project-ref, no link needed):
npx supabase functions deploy <name> --project-ref krtcjxkronmxribkccab --no-verify-jwt
npx supabase secrets list --project-ref krtcjxkronmxribkccab        # names only
```
- `gh` CLI is not installed; use the GitHub REST API with the token from
  `git-credential-manager` for PR operations.
- `supabase` is not global; use `npx supabase`. CLI is already logged in.
- Migrations are applied manually in the Supabase SQL editor, in order.

## Data model (receipts table, shared by all channels)

`id, user_id, date, store_name, raw_text, items[], total, currency, notes,
source ('scan'|'bank-sync'|'bank-import'), external_id, return_deadline`.
`source` drives the 🏦 vs OCR badge in History/Dashboard. RLS: a user only sees
their own rows. `merchant_overrides (user_id, merchant_key, category)` and
`gmail_connections` (now: `forwarding_enabled`, `last_received_at`, no tokens)
are auxiliary.

## Definition of done for any change

1. `npx tsc --noEmit` clean **and** `npm run build` green.
2. Receipt scanning + CSV import unaffected (no regression).
3. New ingestion logic mirrored in all twins.
4. Idempotency preserved (deterministic `external_id`).
5. Verified with a real run where feasible (curl/screenshot/console-clean).
6. Concise commit; secrets never committed.
