// Supabase Edge Function (Deno) — scheduled Gmail sync worker.
//
// Polls every connected user's inbox for bank/card alert emails and streams
// them into the SAME pipeline used everywhere else (fetchNewAlertEmails →
// ingestEmails → djb2 external_id), then upserts idempotently and advances the
// per-user cursor. Bundled by `supabase functions deploy` (esbuild), so the
// shared TS modules under src/ are pulled in — single source of truth.
//
// Trigger modes:
//   • cron (pg_cron / scheduled): no body  → sync ALL connected users
//   • on-demand (from oauth callback): { userId, sinceHours } → one user backfill
//
// Lightweight by design: fetch-based Gmail REST client (no googleapis dep →
// minimal cold start), bounded page size, per-user error isolation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  fetchNewAlertEmails,
  type GmailClient,
  type GmailConnectionStore,
  type GmailMessageRef,
} from '../../src/services/gmailFetcher.ts';
import type { Receipt } from '../../src/types/index.ts';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// ── Google access token from a stored refresh token ───────────────────────────
async function accessTokenFor(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const t = await res.json();
  if (!res.ok || !t.access_token) throw new Error(`token_refresh_failed: ${t.error ?? res.status}`);
  return t.access_token as string;
}

function decodeBody(payload: any): string {
  // Walk the MIME tree for the first text/plain (fallback text/html stripped).
  const stack = [payload];
  let html = '';
  while (stack.length) {
    const p = stack.shift();
    if (!p) continue;
    const data = p.body?.data;
    if (data) {
      const txt = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
      if (p.mimeType === 'text/plain') return txt;
      if (p.mimeType === 'text/html') html = txt.replace(/<[^>]+>/g, ' ');
    }
    if (p.parts) stack.push(...p.parts);
  }
  return html;
}

// ── Lightweight fetch-based GmailClient (no googleapis dep) ────────────────────
function gmailClient(accessToken: string): GmailClient {
  const api = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const auth = { Authorization: `Bearer ${accessToken}` };
  return {
    async listMessages(query: string, afterEpochSec?: number): Promise<GmailMessageRef[]> {
      const q = afterEpochSec ? `${query} after:${afterEpochSec}` : query;
      // Bounded to keep the function well within edge timeout limits.
      const url = `${api}/messages?maxResults=25&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: auth });
      if (!res.ok) throw new Error(`messages.list ${res.status}`);
      const data = await res.json();
      return (data.messages ?? []).map((m: any) => ({ id: m.id, threadId: m.threadId }));
    },
    async getMessageText(id: string): Promise<string> {
      const res = await fetch(`${api}/messages/${id}?format=full`, { headers: auth });
      if (!res.ok) throw new Error(`messages.get ${res.status}`);
      return decodeBody((await res.json()).payload);
    },
    async markRead(id: string): Promise<void> {
      await fetch(`${api}/messages/${id}/modify`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
    },
  };
}

// ── Service-role connection store ─────────────────────────────────────────────
function connectionStore(): GmailConnectionStore {
  return {
    async get(userId: string) {
      const { data } = await admin
        .from('gmail_connections')
        .select('refresh_token, last_synced_at, status')
        .eq('user_id', userId)
        .maybeSingle();
      if (!data || data.status !== 'connected') return null;
      return { userId, refreshToken: data.refresh_token, lastSyncedAt: data.last_synced_at };
    },
    async saveCursor(userId: string, iso: string) {
      await admin.from('gmail_connections')
        .update({ last_synced_at: iso, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    },
    async markError(userId: string, message: string) {
      await admin.from('gmail_connections')
        .update({ status: 'error', error_message: message.slice(0, 500) })
        .eq('user_id', userId);
    },
  };
}

// ── Idempotent receipt upsert (Stage 12 contract) ─────────────────────────────
async function upsertReceipts(userId: string, receipts: Receipt[]): Promise<number> {
  if (receipts.length === 0) return 0;
  const rows = receipts.map((r) => ({
    id:          r.id,
    user_id:     userId,
    date:        r.date,
    store_name:  r.storeName,
    raw_text:    r.rawText,
    items:       r.items,
    total:       r.total,
    currency:    r.currency ?? null,
    source:      r.source ?? 'bank-sync',
    external_id: r.externalId ?? null,
  }));
  const { data, error } = await admin
    .from('receipts')
    .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`upsert_failed: ${error.message}`);
  return data?.length ?? 0;
}

async function syncUser(userId: string, store: GmailConnectionStore) {
  const conn = await store.get(userId);
  if (!conn) return { userId, skipped: 'not_connected' };
  const accessToken = await accessTokenFor(conn.refreshToken);
  const result = await fetchNewAlertEmails(userId, {
    gmail: gmailClient(accessToken),
    store,
  });
  const inserted = await upsertReceipts(userId, result.receipts);
  // Cursor is advanced inside fetchNewAlertEmails (store.saveCursor) only on
  // success, so a thrown error above leaves the window to be retried.
  return { userId, scanned: result.scanned, parsed: result.parsed, inserted };
}

Deno.serve(async (req: Request) => {
  const store = connectionStore();
  let body: { userId?: string } = {};
  try { body = await req.json(); } catch { /* cron: no body */ }

  try {
    if (body.userId) {
      return json(await syncUser(body.userId, store));
    }
    // Cron path: every connected user, isolated failures.
    const { data: conns } = await admin
      .from('gmail_connections')
      .select('user_id')
      .eq('status', 'connected');

    const results = [];
    for (const c of conns ?? []) {
      try { results.push(await syncUser(c.user_id, store)); }
      catch (e) { results.push({ userId: c.user_id, error: String(e) }); }
    }
    return json({ ran: results.length, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
