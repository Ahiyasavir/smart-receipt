/**
 * Email Ingestion — third channel of the Hybrid Ingestion Architecture.
 *
 *   CSV import ──┐
 *   Bank scraper ─┼──▶  normalize (merchantNormalizer) ──▶ classify ──▶ Receipt
 *   Email alerts ─┘                                         (+ merchant_overrides)
 *
 * This service parses bank/credit-card "transaction alert" emails (Gmail via
 * Google OAuth, read-only) into the SAME shape the scraper produces, so all
 * downstream logic — merchant normalization, user category overrides, idempotent
 * upsert on (user_id, external_id) — applies automatically and unchanged.
 *
 * It deliberately does NOT fabricate item-level detail: an alert email is a
 * single transaction, mapped to a single-line Receipt.
 *
 * STATUS: parser implemented (Task 3). The Gmail OAuth fetch + scheduled
 * controller are placeholders (Task 2) — see `ingestEmails` TODOs.
 */

import { Receipt, ReceiptItem, Category } from '../types';
import { normalizeMerchantName, merchantKey } from '../utils/merchantNormalizer';
import { classifyCategory } from '../utils/categoryClassifier';
import type { MerchantOverrides } from '../hooks/useMerchantOverrides';

// ── Parsed shape (Task 3 output contract) ─────────────────────────────────────

export interface ParsedAlert {
  amount: number;        // positive magnitude
  currency: string;      // ISO 4217
  merchant: string;      // RAW description (normalization happens downstream)
  timestamp: string;     // ISO date (YYYY-MM-DD or full ISO)
}

/** Raw email as delivered by the Gmail API (subset we need). */
export interface RawEmail {
  messageId: string;     // Gmail immutable message id — idempotency anchor
  body: string;          // plain-text body (HTML stripped upstream)
  receivedAt?: string;   // ISO; fallback timestamp if body has no date
}

// ── Currency detection ────────────────────────────────────────────────────────

function detectCurrency(raw: string): string {
  if (/\bUSD\b|\$/.test(raw)) return 'USD';
  if (/\bEUR\b|€/.test(raw)) return 'EUR';
  if (/\bGBP\b|£/.test(raw)) return 'GBP';
  if (/₪|ש"ח|ש״ח|\bILS\b|שקל/.test(raw)) return 'ILS';
  return 'ILS'; // default market
}

function toIso(dateStr: string): string | null {
  // Accept DD/MM/YYYY, MM/DD/YYYY (ambiguous → assume MM/DD for $/USD style,
  // DD/MM otherwise), DD.MM.YYYY, YYYY-MM-DD.
  const s = dateStr.trim();
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/))) {
    let [, a, b, y] = m;
    if (y.length === 2) y = `20${y}`;
    // Heuristic: if first field > 12 it must be the day → DD/MM.
    const day = Number(a) > 12 ? a : b;
    const mon = Number(a) > 12 ? b : a;
    return `${y}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

// ── Task 3: Regex parsing engine ──────────────────────────────────────────────
// Ordered list of patterns. Each yields { amount, currency?, merchant, date }.
// Add new bank/card formats here — the rest of the pipeline is untouched.

interface AlertPattern {
  name: string;
  re: RegExp;
  map: (m: RegExpMatchArray) => { amount: string; merchant: string; date: string };
}

// English alert templates (amount may be "12", "12.5" or "12.50").
const PATTERNS: AlertPattern[] = [
  {
    name: 'en-charged-at-on',
    re: /charged\s+[$€£₪]?\s*([\d,]+(?:\.\d{1,2})?)\s+at\s+(.+?)\s+on\s+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/i,
    map: (m) => ({ amount: m[1], merchant: m[2], date: m[3] }),
  },
  {
    name: 'en-transaction-of',
    re: /transaction\s+of\s+[$€£₪]?\s*([\d,]+(?:\.\d{1,2})?)\s+at\s+(.+?)\s+on\s+(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/i,
    map: (m) => ({ amount: m[1], merchant: m[2], date: m[3] }),
  },
];

const DATE_RE = /(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/;

/**
 * Hebrew bank/card alerts vary wildly in word order and filler text, so we
 * extract amount / merchant / date INDEPENDENTLY instead of with one rigid
 * ordered regex. Handles e.g.:
 *   "חיוב בסך 45.90 ש"ח בבית העסק SHUFERSAL בתאריך 14/05/2026"
 *   "בתאריך 16/05/2026 בוצעה עסקת חיוב בסך 89.90 ש"ח בבית העסק WOLT. תודה"
 *   "...חויב בסך 350.00 ש"ח בבית העסק PAZ GAS STATION בתאריך 15/05/2026."
 */
function parseHebrewAlert(text: string): { amount: string; merchant: string; date: string } | null {
  // amount: prefer "בסך <n>", else a number adjacent to a shekel marker
  const amount =
    text.match(/בסך\s*([\d,]+(?:\.\d{1,2})?)/)?.[1] ??
    text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:₪|ש"ח|ש״ח|שקל|ILS)/)?.[1];

  // merchant: "בבית העסק <m>" or "בעסק <m>", stop at the next field/punctuation
  const merchant = text.match(
    /ב(?:בית\s+ה)?עסק\s+(.+?)(?=\s*(?:בתאריך|בסך|בשעה|תודה|המשך|[.,]|$))/,
  )?.[1];

  // date: prefer "בתאריך <d>", else the first date-looking token
  const date =
    text.match(/בתאריך\s*(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/)?.[1] ??
    text.match(DATE_RE)?.[1];

  if (!amount || !merchant || !date) return null;
  return { amount, merchant, date };
}

/**
 * Parse a single alert email body. Returns null if nothing matches — the
 * caller skips it (graceful: unknown formats are ignored, never guessed).
 */
export function parseAlertEmail(body: string, fallbackIso?: string): ParsedAlert | null {
  const text = body.replace(/\s+/g, ' ').trim();

  const candidates: ({ amount: string; merchant: string; date: string })[] = [];
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) candidates.push(p.map(m));
  }
  const he = parseHebrewAlert(text);
  if (he) candidates.push(he);

  for (const { amount, merchant, date } of candidates) {
    const numeric = parseFloat(amount.replace(/,/g, ''));
    if (!isFinite(numeric) || numeric <= 0) continue;
    const iso = toIso(date) ?? (fallbackIso ? fallbackIso.slice(0, 10) : null);
    if (!iso) continue;
    return {
      amount: Math.abs(numeric),
      currency: detectCurrency(text),
      merchant: merchant.trim(),
      timestamp: iso,
    };
  }
  return null;
}

// ── Idempotency ───────────────────────────────────────────────────────────────
// Deterministic id so re-scanning the same inbox never duplicates a transaction.
// Anchored on the immutable Gmail message id + the transaction's own fields.

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function buildEmailExternalId(messageId: string, alert: ParsedAlert): string {
  const sig = `${messageId}|${alert.timestamp}|${alert.amount}|${merchantKey(alert.merchant)}`;
  return `email_${djb2(sig)}`;
}

// ── Email alert → Receipt (same contract as the scraper) ──────────────────────

export function alertToReceipt(
  email: RawEmail,
  alert: ParsedAlert,
  overrides: MerchantOverrides = {},
): Receipt {
  const merchant = normalizeMerchantName(alert.merchant);
  const key = merchantKey(alert.merchant);
  const category: Category =
    overrides[key] ?? classifyCategory(`${alert.merchant} ${merchant}`, merchant);

  const item: ReceiptItem = {
    id: crypto.randomUUID(),
    name: merchant,
    amount: alert.amount,
    category,
    raw: email.body.slice(0, 500),
  };

  return {
    id: crypto.randomUUID(),
    date: new Date(alert.timestamp).toISOString(),
    storeName: merchant,
    rawText: alert.merchant,           // original (raw) description, per pipeline spec
    items: [item],
    total: alert.amount,
    currency: alert.currency,
    source: 'bank-sync',              // ingested, not user-typed
    externalId: buildEmailExternalId(email.messageId, alert),
  };
}

// ── Task 2: Ingestion controller (placeholder) ────────────────────────────────
/**
 * Designed to sit alongside `scraper/sync.mjs`. Same dependency it needs:
 * the user's merchant_overrides (so corrections apply to email-sourced txns).
 *
 * The Gmail fetch itself MUST run server-side (Edge Function / Action) with a
 * read-only OAuth scope (`gmail.readonly`); the refresh token lives in the
 * secure backend, NEVER in frontend state or localStorage.
 */
export function ingestEmails(
  emails: RawEmail[],
  overrides: MerchantOverrides = {},
): Receipt[] {
  const out: Receipt[] = [];
  for (const email of emails) {
    const alert = parseAlertEmail(email.body, email.receivedAt);
    if (!alert) continue; // unknown format → skip, never fabricate
    out.push(alertToReceipt(email, alert, overrides));
  }
  return out;
  // TODO(server): Gmail OAuth (gmail.readonly) + history-based incremental
  //   fetch of transaction-alert senders; persist refresh token in backend
  //   secrets only. Upsert results via the existing (user_id, external_id) path.
  // TODO: per-bank sender allow-list + subject filters to cut parse volume.
}
