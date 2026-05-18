/**
 * Gmail Fetcher — server-side entry point for the email-ingestion channel.
 *
 * Runs in a trusted server context only (Supabase Edge Function / GitHub
 * Action / serverless handler) — NEVER in the browser. It polls a user's inbox
 * for bank/card *alert* emails and feeds them into the existing
 * `ingestEmails()` pipeline, which handles normalization, category overrides
 * and idempotent upsert on (user_id, external_id).
 *
 * ── Required secure environment ───────────────────────────────────────────────
 *   GOOGLE_CLIENT_ID       OAuth client id            (server env / Action secret)
 *   GOOGLE_CLIENT_SECRET   OAuth client secret        (server env / Action secret)
 *   SUPABASE_URL                                       (server env)
 *   SUPABASE_SERVICE_ROLE_KEY  reads gmail_connections (server env, never frontend)
 *   GMAIL_REFRESH_TOKEN    NOT a global env — stored PER USER in the
 *                          `gmail_connections` table (migration 008) and read
 *                          with the service-role key. The frontend only ever
 *                          learns connected=true/false, never the token.
 *
 * ── Privacy ───────────────────────────────────────────────────────────────────
 *   • Scope requested is strictly  https://www.googleapis.com/auth/gmail.readonly
 *   • The Gmail query itself restricts results to a hard-coded bank-sender
 *     allow-list, so non-bank email is filtered SERVER-SIDE BY GMAIL and is
 *     never downloaded, never read, never text-processed by us.
 *
 * ── Dependency injection ──────────────────────────────────────────────────────
 *   This module contains zero `googleapis` imports so it stays build-GREEN with
 *   no new frontend deps and is unit-testable. The real Google client is built
 *   by an adapter at the serverless edge and passed in as `GmailClient`
 *   (see `createGoogleGmailClient` doc at the bottom).
 */

import { Receipt } from '../types';
import { ingestEmails, RawEmail } from './emailIngestion';
import type { MerchantOverrides } from '../hooks/useMerchantOverrides';

// ── Bank/card alert sender allow-list ─────────────────────────────────────────
// Add senders here as new banks/cards are supported. Anything not on this list
// is excluded by the Gmail query and therefore never fetched.
export const BANK_ALERT_SENDERS = [
  'alerts@cal-online.co.il',
  'max.co.il',
  'isracard.co.il',
  'leumi-card.co.il',
  'chase.com',
] as const;

/** Build the restrictive Gmail search query (privacy + cost minimisation). */
export function buildAlertQuery(senders: readonly string[] = BANK_ALERT_SENDERS): string {
  const from = senders.map((s) => `from:${s}`).join(' OR ');
  return `is:unread (${from})`;
}

// ── Injected provider contracts ───────────────────────────────────────────────

export interface GmailMessageRef {
  id: string;
  threadId?: string;
}

export interface GmailClient {
  /** users.messages.list — supports incremental fetch via `afterEpochSec`. */
  listMessages(query: string, afterEpochSec?: number): Promise<GmailMessageRef[]>;
  /** users.messages.get — returns decoded text/plain body for one message. */
  getMessageText(messageId: string): Promise<string>;
  /** users.messages.modify — remove UNREAD so it isn't re-evaluated. */
  markRead(messageId: string): Promise<void>;
}

/** Persisted per-user Gmail connection (row in `gmail_connections`). */
export interface GmailConnection {
  userId: string;
  refreshToken: string;
  lastSyncedAt?: string | null;
}

export interface GmailConnectionStore {
  get(userId: string): Promise<GmailConnection | null>;
  /** Advance the incremental cursor after a successful run. */
  saveCursor(userId: string, lastSyncedAtIso: string): Promise<void>;
  markError(userId: string, message: string): Promise<void>;
}

export interface FetchDeps {
  /** Built from the user's refresh token by the serverless adapter. */
  gmail: GmailClient;
  store: GmailConnectionStore;
  /** User's saved merchant→category corrections (applied during ingest). */
  overrides?: MerchantOverrides;
}

export interface FetchResult {
  scanned: number;     // emails downloaded
  parsed: number;      // emails that matched a known alert pattern
  receipts: Receipt[]; // ready to upsert via the (user_id, external_id) path
  cursorIso: string;   // new incremental cursor
}

// ── Main flow ─────────────────────────────────────────────────────────────────
/**
 * Poll one user's inbox for new bank-alert emails and convert them to receipts.
 *
 * Caller is responsible for persisting `result.receipts` through the existing
 * idempotent upsert (so re-runs never duplicate) and is given a fresh cursor.
 */
export async function fetchNewAlertEmails(
  userId: string,
  deps: FetchDeps,
): Promise<FetchResult> {
  const { gmail, store, overrides } = deps;

  // 1. AUTH — the connection (and thus the short-lived access token derived
  //    from the per-user refresh token) is resolved by the adapter that built
  //    `gmail`. We only need the cursor here.
  const conn = await store.get(userId);
  if (!conn) {
    throw new Error(`No Gmail connection for user ${userId} — user must connect first.`);
  }

  const sinceIso = conn.lastSyncedAt ?? undefined;
  const afterEpochSec = sinceIso
    ? Math.floor(new Date(sinceIso).getTime() / 1000)
    : undefined;
  const runStartedIso = new Date().toISOString();

  try {
    // 2. TARGETED QUERY — Gmail filters to the bank-sender allow-list and to
    //    messages newer than our cursor. Non-bank mail is never returned, so
    //    it is discarded before any body is fetched or text is processed.
    const query = buildAlertQuery();
    const refs = await gmail.listMessages(query, afterEpochSec);

    if (refs.length === 0) {
      await store.saveCursor(userId, runStartedIso);
      return { scanned: 0, parsed: 0, receipts: [], cursorIso: runStartedIso };
    }

    // 3. HANDSHAKE — pull bodies for the (already bank-only) messages and hand
    //    them to the shared ingestion pipeline. messageId anchors idempotency.
    const rawEmails: RawEmail[] = [];
    for (const ref of refs) {
      const body = await gmail.getMessageText(ref.id);
      rawEmails.push({ messageId: ref.id, body, receivedAt: runStartedIso });
    }

    const receipts = ingestEmails(rawEmails, overrides ?? {});

    // Mark processed so the next cycle won't re-evaluate them (cursor is the
    // primary guard; markRead is best-effort and must not fail the run).
    for (const ref of refs) {
      try { await gmail.markRead(ref.id); } catch { /* non-fatal */ }
    }

    await store.saveCursor(userId, runStartedIso);

    return {
      scanned: rawEmails.length,
      parsed: receipts.length,
      receipts,
      cursorIso: runStartedIso,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await store.markError(userId, message);
    throw err;
  }
}

// ── Serverless adapter contract (implemented at the edge) ─────────────────────
/**
 * The serverless function provides the concrete `GmailClient`. Pseudocode of
 * the adapter it must implement (kept OUT of this module so the frontend build
 * carries no `googleapis` dependency):
 *
 *   import { google } from 'googleapis';
 *   export function createGoogleGmailClient(refreshToken: string): GmailClient {
 *     const oauth2 = new google.auth.OAuth2(
 *       process.env.GOOGLE_CLIENT_ID,
 *       process.env.GOOGLE_CLIENT_SECRET,
 *     );
 *     oauth2.setCredentials({ refresh_token: refreshToken }); // short-lived
 *     const api = google.gmail({ version: 'v1', auth: oauth2 });
 *     return {
 *       listMessages: async (q, afterEpochSec) => {
 *         const query = afterEpochSec ? `${q} after:${afterEpochSec}` : q;
 *         const { data } = await api.users.messages.list({ userId: 'me', q: query });
 *         return (data.messages ?? []).map(m => ({ id: m.id!, threadId: m.threadId }));
 *       },
 *       getMessageText: async (id) => {
 *         const { data } = await api.users.messages.get({
 *           userId: 'me', id, format: 'full' });
 *         return decodeTextPlain(data.payload); // base64url → utf8
 *       },
 *       markRead: async (id) => {
 *         await api.users.messages.modify({
 *           userId: 'me', id, requestBody: { removeLabelIds: ['UNREAD'] } });
 *       },
 *     };
 *   }
 *
 * TODO(server): implement the adapter + a Supabase-backed GmailConnectionStore
 *   (service-role) and wire both into the existing bank-sync schedule.
 */
