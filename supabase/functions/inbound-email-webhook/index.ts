// Supabase Edge Function (Deno) — inbound email webhook (PUSH ingestion).
//
// Event-driven replacement for the OAuth/cron PULL model. An email provider
// (SendGrid Inbound Parse / Cloudflare Email Routing) POSTs a forwarded bank
// alert here. Zero server load when there are no transactions; no Gmail OAuth,
// no refresh tokens, no $15k gmail.readonly audit.
//
// Flow:
//   user auto-forwards bank alert → sync+<user_uuid>@<domain>
//     → provider POSTs parsed email here
//     → resolve user_uuid from the recipient address
//     → existing regex parser + djb2 idempotency + merchant overrides
//     → idempotent upsert into receipts
//
// Security: a shared secret (INBOUND_WEBHOOK_SECRET) must arrive as the
// `?token=` query param or `x-webhook-secret` header, so randoms can't inject
// fake transactions. The user_uuid is additionally FK-validated by the DB.
//
// Deploy:  supabase functions deploy inbound-email-webhook --no-verify-jwt
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INBOUND_WEBHOOK_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('INBOUND_WEBHOOK_SECRET') ?? '';
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

// ── Deterministic classifier (mirrors scraper/sync.mjs) ───────────────────────
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
// Deterministic confidence: user override = certain; keyword hit = high;
// unclassified fallback = low (so the UI can flag it for review).
function confidenceFor(category: string, fromOverride: boolean): number {
  if (fromOverride) return 1;
  return category === 'other' ? 0.4 : 0.85;
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
// ── Canonical sanitizer (twin of src/utils/textSanitize.ts) ───────────────────
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#34;': '"',
  '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>',
  '&shy;': '', '&zwnj;': '', '&zwj;': '', '&lrm;': '', '&rlm;': '',
};
const INVISIBLE_RE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const EXOTIC_WS_RE = /[\u00A0\u2000-\u200A\u202F\u205F\u3000\t\f\v]/g;
function sanitize(raw: unknown): string {
  if (raw == null) return '';
  let s = String(raw);
  try { s = s.normalize('NFC'); } catch { /* keep */ }
  s = s.replace(INVISIBLE_RE, '');
  s = s.replace(/&[a-zA-Z]+;|&#\d+;/g, (m) => {
    if (m in HTML_ENTITIES) return HTML_ENTITIES[m];
    const num = /^&#(\d+);$/.exec(m);
    if (num) {
      const c = Number(num[1]);
      if (c > 0 && c < 0x10ffff) { try { return String.fromCodePoint(c); } catch { return ' '; } }
    }
    return ' ';
  });
  s = s.replace(EXOTIC_WS_RE, ' ');
  s = s.replace(/([^\s])\r?\n([^\s])/g, '$1 $2');
  return s.replace(/\s+/g, ' ').trim();
}

type ParseFailReason = 'empty_body' | 'no_pattern_match' | 'invalid_amount' | 'invalid_date';
interface ParsedAlert { amount: number; currency: string; merchant: string; timestamp: string; }

function parseAlertDetailed(
  body: string,
  fallbackIso?: string,
): { alert: ParsedAlert | null; reason?: ParseFailReason } {
  const text = sanitize(body);
  if (!text) return { alert: null, reason: 'empty_body' };
  const candidates: { amount: string; merchant: string; date: string }[] = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) candidates.push(p.map(m));
  }
  const he = parseHebrewAlert(text);
  if (he) candidates.push(he);
  if (candidates.length === 0) return { alert: null, reason: 'no_pattern_match' };
  let badAmt = false, badDate = false;
  for (const { amount, merchant, date } of candidates) {
    const n = parseFloat(amount.replace(/,/g, ''));
    if (!isFinite(n) || n <= 0) { badAmt = true; continue; }
    const iso = toIso(date) ?? (fallbackIso ? fallbackIso.slice(0, 10) : null);
    if (!iso) { badDate = true; continue; }
    return { alert: { amount: Math.abs(n), currency: detectCurrency(text), merchant: merchant.trim(), timestamp: iso } };
  }
  return { alert: null, reason: badAmt ? 'invalid_amount' : badDate ? 'invalid_date' : 'no_pattern_match' };
}
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function buildExternalId(messageId: string, a: ParsedAlert): string {
  return `email_${djb2(`${messageId}|${a.timestamp}|${a.amount}|${merchantKey(a.merchant)}`)}`;
}

// ── Inbound payload extraction (SendGrid Inbound Parse / Cloudflare / JSON) ────
interface Inbound { to: string; messageId: string; body: string; }

async function readInbound(req: Request): Promise<Inbound> {
  const ct = req.headers.get('content-type') ?? '';
  let to = '', body = '', messageId = '', headers = '', subject = '';

  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    // SendGrid Inbound Parse posts form fields.
    const f = await req.formData();
    to        = String(f.get('to') ?? '');
    body      = String(f.get('text') ?? '');
    headers   = String(f.get('headers') ?? '');
    subject   = String(f.get('subject') ?? '');
    const env = String(f.get('envelope') ?? '');
    if (!to && env) { try { to = (JSON.parse(env).to ?? []).join(',') ; } catch { /* ignore */ } }
    if (!body) {
      const html = String(f.get('html') ?? '');
      if (html) body = html.replace(/<[^>]+>/g, ' ');
    }
  } else {
    // Cloudflare Email Worker / generic JSON.
    const j = await req.json().catch(() => ({}));
    to        = j.to ?? j.recipient ?? '';
    body      = j.text ?? j.body ?? (j.html ? String(j.html).replace(/<[^>]+>/g, ' ') : '');
    messageId = j['message-id'] ?? j.messageId ?? '';
    subject   = j.subject ?? '';
  }

  if (!messageId) {
    const m = headers.match(/^Message-I[dD]:\s*(.+)$/m);
    // Stable fallback so re-deliveries of the same email still dedupe.
    messageId = (m?.[1]?.trim()) || `fwd_${djb2(`${to}|${subject}|${body.slice(0, 200)}`)}`;
  }
  return { to, messageId, body };
}

const UUID_RE =
  /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

/**
 * Resolve the owning user from the recipient address.
 *  - New (productized): sync_<alias>@domain  → look up bank_sync_alias.
 *  - Legacy (back-compat): sync+<uuid>@domain → use the uuid directly.
 * Returns null if neither resolves to a real user.
 */
async function resolveUser(to: string): Promise<string | null> {
  // Non-guessable alias form: sync_<token>
  const am = to.match(/sync_([a-z0-9]{16,64})@/i);
  if (am) {
    const { data } = await admin.from('gmail_connections')
      .select('user_id, forwarding_enabled')
      .eq('bank_sync_alias', am[1].toLowerCase())
      .maybeSingle();
    if (data && data.forwarding_enabled !== false) return data.user_id as string;
    return null; // unknown/revoked alias
  }
  // Legacy uuid form (existing setups / tests): sync+<uuid> or bare <uuid>
  const um = to.match(UUID_RE);
  return um ? um[1].toLowerCase() : null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Shared-secret gate (query token or header).
  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? req.headers.get('x-webhook-secret') ?? '';
  if (!WEBHOOK_SECRET || token !== WEBHOOK_SECRET) return json({ error: 'unauthorized' }, 401);

  try {
    const { to, messageId, body } = await readInbound(req);
    // Defensive size cap — alerts are tiny; anything large is junk/abuse.
    if (body && body.length > 100_000) return json({ error: 'payload_too_large' }, 413);

    const userId = await resolveUser(to);
    if (!userId) return json({ error: 'unknown_recipient' }, 404);
    if (!body)   return json({ error: 'empty_body' }, 400);

    const { alert, reason } = parseAlertDetailed(body);
    if (!alert) {
      // Ack (never guess) but log a deterministic, PII-free diagnostic.
      console.log(JSON.stringify({ evt: 'parse_skip', reason, bodyLen: body.length }));
      return json({ ok: true, parsed: false, reason });
    }

    // User merchant overrides (corrections carry over to forwarded txns).
    const { data: ov } = await admin.from('merchant_overrides')
      .select('merchant_key, category').eq('user_id', userId);
    const overrides = new Map<string, string>((ov ?? []).map((r: any) => [r.merchant_key, r.category]));

    const merchant = normalizeMerchantName(alert.merchant);
    const key = merchantKey(alert.merchant);
    const fromOverride = overrides.has(key);
    const category = overrides.get(key) ?? classify(`${alert.merchant} ${merchant}`);
    const confidence = confidenceFor(category, fromOverride);

    const row = {
      id: crypto.randomUUID(),
      user_id: userId,
      date: new Date(alert.timestamp).toISOString(),
      store_name: merchant,
      raw_text: alert.merchant,
      // PII minimization: keep only the parsed merchant string, never the
      // raw email body.
      items: [{ id: crypto.randomUUID(), name: merchant, amount: alert.amount, category, confidence, raw: alert.merchant }],
      total: alert.amount,
      currency: alert.currency,
      source: 'bank-sync',
      external_id: buildExternalId(messageId, alert),
    };

    const { data, error } = await admin.from('receipts')
      .upsert(row, { onConflict: 'user_id,external_id', ignoreDuplicates: true })
      .select('id');
    if (error) {
      // FK violation here means the uuid isn't a real user — reject cleanly.
      // Internal DB detail is logged server-side only, never returned.
      console.error(JSON.stringify({ evt: 'persist_failed', code: error.code ?? null }));
      return json({ error: 'persist_failed' }, 400);
    }

    const inserted = data?.length ?? 0;
    // Mark the forwarding connection active / record last receipt (best-effort).
    await admin.from('gmail_connections').upsert({
      user_id: userId,
      status: 'active',
      forwarding_enabled: true,
      last_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return json({ ok: true, parsed: true, inserted, duplicate: inserted === 0 });
  } catch (e) {
    // Never leak internals/stack to the caller; log server-side only.
    console.error(JSON.stringify({ evt: 'webhook_exception', msg: String(e).slice(0, 200) }));
    return json({ error: 'internal_error' }, 500);
  }
});
