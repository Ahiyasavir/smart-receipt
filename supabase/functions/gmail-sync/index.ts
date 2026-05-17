// Supabase Edge Function (Deno) — scheduled Gmail sync worker.
//
// SELF-CONTAINED by design: Deno's bundler can't resolve the extensionless
// cross-`src/` import chain, so this worker carries a server twin of the
// parsing/normalization pipeline — the exact same pattern as
// scraper/lib/merchant.mjs mirroring src/utils/merchantNormalizer.ts.
// Logic here is kept byte-equivalent to src/services/emailIngestion.ts +
// src/utils/merchantNormalizer.ts so user merchant_overrides and external_id
// hashing stay consistent across channels.
//
// Trigger modes:
//   • cron (no body)            → sync ALL connected users
//   • { userId } (oauth kick)   → backfill one user
//
// Lightweight: fetch-based Gmail REST (no googleapis dep), bounded page size,
// per-user error isolation, single token refresh per user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!;
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// ── Merchant normalization (twin of src/utils/merchantNormalizer.ts) ──────────
const PREFIX_PATTERNS: RegExp[] = [
  /^(PAYMENT TO|PAY TO|PURCHASE AT|POS PURCHASE AT|POS |CARD PAYMENT |DIRECT DEBIT |DD |SO )\s*/i,
  /^(BIT\/PAYBOX |BIT |PAYBOX |BIT PAY |PAYBOX PAY )\s*/i,
  /^(ISRACARD |LEUMI CARD |MAX CARD |CAL CARD |CAL |VISA |MASTERCARD )\s*/i,
  /^(כרטיס \d{4} )/,
  /^(\d{4} )/,
];
const NOISE_PATTERNS: RegExp[] = [
  /\s+\d{6,}/g, /\s+\*\d+/g, /\s+\d{2}\/\d{2}(\/\d{2,4})?/g,
  /\s+REF[:\s]\s*\w+/gi, /\s+TXN\s*\d+/gi, /\s+#\s*\d+/g, /\s{2,}/g,
];
const BRAND_MAP: Record<string, string> = {
  'MCDONALDS': "McDonald's", 'MCDONALD S': "McDonald's", 'STARBUCKS COFFEE': 'Starbucks',
  'KFC RESTAURANT': 'KFC', 'BURGER KING': 'Burger King', 'SHUFERSAL DEAL': 'Shufersal',
  'SHUFERSAL ONLINE': 'Shufersal', 'RAMI LEVI': 'Rami Levy', 'SUPER PHARM': 'Super-Pharm',
  'SUPERPHARM': 'Super-Pharm', 'שופרסל דיל': 'שופרסל', 'שופרסל אונליין': 'שופרסל',
  'רמי לוי שיווק': 'רמי לוי',
};
function normalizeMerchantName(raw: string): string {
  let name = String(raw ?? '').trim();
  for (const re of PREFIX_PATTERNS) name = name.replace(re, '');
  for (const re of NOISE_PATTERNS) name = name.replace(re, ' ');
  name = name.trim();
  const upper = name.toUpperCase();
  for (const [k, v] of Object.entries(BRAND_MAP)) if (upper === k.toUpperCase()) return v;
  const hasHebrew = /[֐-׿]/.test(name);
  if (!hasHebrew && /[a-zA-Z]/.test(name)) name = name.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
  return name || String(raw ?? '').trim();
}
function merchantKey(raw: string): string {
  return normalizeMerchantName(raw).toLowerCase()
    .replace(/[\s\-'.&/\\]+/g, '_').replace(/[^a-z0-9_֐-׿]/g, '')
    .replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 80);
}

// ── Lightweight deterministic classifier (mirrors scraper/sync.mjs) ───────────
const KEYWORD_MAP: Record<string, string[]> = {
  food:          ['coffee','cafe','restaurant','pizza','burger','sushi','mcdonalds','starbucks','kfc','subway','dominos','falafel','shawarma','hummus','aroma','cofix'],
  groceries:     ['supermarket','shufersal','mega','rami levy','victory','yochananof','osher ad','am:pm','tivtam','grocery','שופרסל','רמי לוי'],
  transport:     ['fuel','gas','petrol','parking','toll','bus','train','uber','gett','taxi','rav kav','paz','sonol','delek','דלק'],
  entertainment: ['movie','cinema','concert','netflix','spotify','hulu','disney','game','museum','zoo','yes','hot'],
  health:        ['pharmacy','super-pharm','superpharm','clinic','doctor','hospital','dental','gym','fitness','clalit','maccabi','מכבי'],
  shopping:      ['zara','h&m','castro','renuar','golf','terminal x','amazon','ebay','ikea','ace','home center','fox'],
  utilities:     ['electric','electricity','partner','cellcom','bezeq','pelephone','arnona','water','insurance','rent','בזק','סלקום'],
};
function classify(text: string): string {
  const lower = text.toLowerCase();
  for (const [cat, kws] of Object.entries(KEYWORD_MAP)) if (kws.some((k) => lower.includes(k))) return cat;
  return 'other';
}

// ── Alert parser (twin of src/services/emailIngestion.ts) ─────────────────────
function detectCurrency(raw: string): string {
  if (/\bUSD\b|\$/.test(raw)) return 'USD';
  if (/\bEUR\b|€/.test(raw)) return 'EUR';
  if (/\bGBP\b|£/.test(raw)) return 'GBP';
  if (/₪|ש"ח|ש״ח|\bILS\b|שקל/.test(raw)) return 'ILS';
  return 'ILS';
}
function toIso(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m; if (y.length === 2) y = `20${y}`;
    const day = Number(a) > 12 ? a : b, mon = Number(a) > 12 ? b : a;
    return `${y}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}
// Twin of src/services/emailIngestion.ts — keep equivalent.
const PATTERNS: { re: RegExp; map: (m: RegExpMatchArray) => { amount: string; merchant: string; date: string } }[] = [
  { re: /charged\s+[$€£₪]?\s*([\d,]+(?:\.\d{1,2})?)\s+at\s+(.+?)\s+on\s+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/i,
    map: (m) => ({ amount: m[1], merchant: m[2], date: m[3] }) },
  { re: /transaction\s+of\s+[$€£₪]?\s*([\d,]+(?:\.\d{1,2})?)\s+at\s+(.+?)\s+on\s+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/i,
    map: (m) => ({ amount: m[1], merchant: m[2], date: m[3] }) },
];
const DATE_RE = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/;
function parseHebrewAlert(text: string): { amount: string; merchant: string; date: string } | null {
  const amount =
    text.match(/בסך\s*([\d,]+(?:\.\d{1,2})?)/)?.[1] ??
    text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:₪|ש"ח|ש״ח|שקל|ILS)/)?.[1];
  const merchant = text.match(
    /ב(?:בית\s+ה)?עסק\s+(.+?)(?=\s*(?:בתאריך|בסך|בשעה|תודה|המשך|[.,]|$))/,
  )?.[1];
  const date =
    text.match(/בתאריך\s*(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/)?.[1] ??
    text.match(DATE_RE)?.[1];
  if (!amount || !merchant || !date) return null;
  return { amount, merchant, date };
}
interface ParsedAlert { amount: number; currency: string; merchant: string; timestamp: string; }
function parseAlertEmail(body: string, fallbackIso?: string): ParsedAlert | null {
  const text = body.replace(/\s+/g, ' ').trim();
  const candidates: { amount: string; merchant: string; date: string }[] = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) candidates.push(p.map(m));
  }
  const he = parseHebrewAlert(text);
  if (he) candidates.push(he);
  for (const { amount, merchant, date } of candidates) {
    const n = parseFloat(amount.replace(/,/g, ''));
    if (!isFinite(n) || n <= 0) continue;
    const iso = toIso(date) ?? (fallbackIso ? fallbackIso.slice(0, 10) : null);
    if (!iso) continue;
    return { amount: Math.abs(n), currency: detectCurrency(text), merchant: merchant.trim(), timestamp: iso };
  }
  return null;
}
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function buildExternalId(messageId: string, a: ParsedAlert): string {
  return `email_${djb2(`${messageId}|${a.timestamp}|${a.amount}|${merchantKey(a.merchant)}`)}`;
}

// ── Gmail REST client ─────────────────────────────────────────────────────────
const BANK_SENDERS = ['alerts@cal-online.co.il','max.co.il','isracard.co.il','leumi-card.co.il','chase.com'];
// Optional, reversible test hook: set GMAIL_TEST_SENDER to a comma-separated
// list of extra allowed sender addresses (e.g. your own email) to validate the
// pipeline end-to-end without a real card charge. Unset it after testing.
const TEST_SENDERS = (Deno.env.get('GMAIL_TEST_SENDER') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const ALL_SENDERS = [...BANK_SENDERS, ...TEST_SENDERS];
// No `is:unread`: incremental fetch is driven by the `after:<last_synced_at>`
// cursor, and duplicates are impossible thanks to the deterministic djb2
// external_id + ignoreDuplicates upsert. Filtering on read-state would miss
// alerts the user opened before the sync ran.
const ALERT_QUERY = `(${ALL_SENDERS.map((s) => `from:${s}`).join(' OR ')})`;

async function accessTokenFor(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const t = await res.json();
  if (!res.ok || !t.access_token) throw new Error(`token_refresh_failed: ${t.error ?? res.status}`);
  return t.access_token as string;
}
// base64url → bytes → proper UTF-8 (Gmail bodies are UTF-8; a plain atob()
// leaves multibyte Hebrew/emoji as Latin-1 mojibake and breaks every regex).
function b64urlToUtf8(data: string): string {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}
const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#34;': '"',
  '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>',
};
function decodeBody(payload: any): string {
  const stack = [payload]; let plain = ''; let html = '';
  while (stack.length) {
    const p = stack.shift(); if (!p) continue;
    const data = p.body?.data;
    if (data) {
      const txt = b64urlToUtf8(data);
      if (p.mimeType === 'text/plain') plain += txt;
      else if (p.mimeType === 'text/html') html += txt;
    }
    if (p.parts) stack.push(...p.parts);
  }
  // Prefer a non-trivial plain part; otherwise strip HTML tags.
  let out = plain.trim().length > 3 ? plain : html.replace(/<[^>]+>/g, ' ');
  out = out.replace(/&\w+;|&#\d+;/g, (m) => ENTITIES[m] ?? ' ');
  // Drop bidi / zero-width marks that can split tokens.
  return out.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
}

// ── Per-user sync ─────────────────────────────────────────────────────────────
async function syncUser(userId: string, sinceHours?: number, debug?: boolean) {
  const { data: conn } = await admin.from('gmail_connections')
    .select('refresh_token, last_synced_at, status').eq('user_id', userId).maybeSingle();
  // 'error' is retried (self-healing) — only 'revoked'/missing is terminal.
  if (!conn || (conn.status !== 'connected' && conn.status !== 'error'))
    return { userId, skipped: 'not_connected' };

  const runStartedIso = new Date().toISOString();
  try {
    const accessToken = await accessTokenFor(conn.refresh_token);
    const auth = { Authorization: `Bearer ${accessToken}` };
    const api = 'https://gmail.googleapis.com/gmail/v1/users/me';

    // sinceHours widens the fetch window (backfill / reprocess); the stored
    // cursor still only moves forward, and idempotency prevents duplicates.
    const afterSec = sinceHours
      ? Math.floor((Date.now() - sinceHours * 3600_000) / 1000)
      : conn.last_synced_at ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000) : undefined;
    const q = afterSec ? `${ALERT_QUERY} after:${afterSec}` : ALERT_QUERY;
    const listRes = await fetch(`${api}/messages?maxResults=25&q=${encodeURIComponent(q)}`, { headers: auth });
    if (!listRes.ok) throw new Error(`messages.list ${listRes.status}`);
    const refs = (await listRes.json()).messages ?? [];

    // overrides → applied so user corrections carry to email-sourced txns
    const { data: ovRows } = await admin.from('merchant_overrides')
      .select('merchant_key, category').eq('user_id', userId);
    const overrides = new Map<string, string>((ovRows ?? []).map((r: any) => [r.merchant_key, r.category]));

    const rows: any[] = [];
    const dbg: any[] = [];
    for (const ref of refs) {
      const gRes = await fetch(`${api}/messages/${ref.id}?format=full`, { headers: auth });
      if (!gRes.ok) continue;
      const body = decodeBody((await gRes.json()).payload);
      const alert = parseAlertEmail(body, runStartedIso);
      if (debug) {
        dbg.push({ id: ref.id, parsed: !!alert, len: body.length, sample: body.slice(0, 280) });
      }
      if (!alert) continue; // unknown format → skip, never fabricate

      const merchant = normalizeMerchantName(alert.merchant);
      const key = merchantKey(alert.merchant);
      const category = overrides.get(key) ?? classify(`${alert.merchant} ${merchant}`);
      const id = crypto.randomUUID();
      rows.push({
        id, user_id: userId, date: new Date(alert.timestamp).toISOString(),
        store_name: merchant, raw_text: alert.merchant,
        items: [{ id: crypto.randomUUID(), name: merchant, amount: alert.amount, category, raw: body.slice(0, 500) }],
        total: alert.amount, currency: alert.currency, source: 'bank-sync',
        external_id: buildExternalId(ref.id, alert),
      });
      // No mark-as-read: we never mutate the user's mailbox. Dedup is handled
      // entirely by the cursor + deterministic external_id.
    }

    if (debug) return { userId, scanned: refs.length, parsed: rows.length, debug: dbg };

    let inserted = 0;
    if (rows.length) {
      const { data, error } = await admin.from('receipts')
        .upsert(rows, { onConflict: 'user_id,external_id', ignoreDuplicates: true }).select('id');
      if (error) throw new Error(`upsert_failed: ${error.message}`);
      inserted = data?.length ?? 0;
    }

    // Cursor advances ONLY after a successful batch.
    await admin.from('gmail_connections')
      .update({ last_synced_at: runStartedIso, status: 'connected', error_message: null, updated_at: runStartedIso })
      .eq('user_id', userId);

    return { userId, scanned: refs.length, parsed: rows.length, inserted };
  } catch (e) {
    await admin.from('gmail_connections')
      .update({ status: 'error', error_message: String(e).slice(0, 500) }).eq('user_id', userId);
    return { userId, error: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  let body: { userId?: string; sinceHours?: number; debug?: boolean } = {};
  try { body = await req.json(); } catch { /* cron: no body */ }
  try {
    if (body.userId) return json(await syncUser(body.userId, body.sinceHours, body.debug));
    const { data: conns } = await admin.from('gmail_connections')
      .select('user_id').in('status', ['connected', 'error']);
    const results = [];
    for (const c of conns ?? []) results.push(await syncUser(c.user_id)); // failures isolated in syncUser
    return json({ ran: results.length, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
