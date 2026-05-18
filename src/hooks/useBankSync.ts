import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';

/**
 * Per-user bank-sync identity (email-forwarding channel).
 *
 * The public forwarding address is `sync_<alias>@<domain>` where `alias` is a
 * random, non-guessable token decoupled from the auth user id. The token can
 * be regenerated (revokes the old address) and forwarding can be disabled
 * without deleting history. The frontend never sees webhook URLs or secrets.
 */

const INBOUND_DOMAIN =
  (import.meta.env.VITE_INBOUND_EMAIL_DOMAIN as string | undefined) ??
  'inbound.smartreceipt.app';

/** 24 lowercase hex chars (~96 bits) — matches migration 011 + webhook regex. */
function newAlias(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export interface BankSyncState {
  alias: string | null;
  address: string | null;          // full sync_<alias>@domain
  enabled: boolean;                // forwarding currently active
  connected: boolean;             // we've actually received ≥1 email
  lastReceivedAt: string | null;
  loading: boolean;
}

export function useBankSync(userId: string) {
  const [state, setState] = useState<BankSyncState>({
    alias: null, address: null, enabled: false, connected: false,
    lastReceivedAt: null, loading: true,
  });

  const apply = (row: {
    bank_sync_alias?: string | null;
    forwarding_enabled?: boolean | null;
    last_received_at?: string | null;
  } | null) => {
    const alias = row?.bank_sync_alias ?? null;
    setState({
      alias,
      address: alias ? `sync_${alias}@${INBOUND_DOMAIN}` : null,
      enabled: row?.forwarding_enabled !== false && !!alias,
      connected: !!row?.last_received_at,
      lastReceivedAt: row?.last_received_at ?? null,
      loading: false,
    });
  };

  /** Load the row; lazily create one with a fresh alias if none exists. */
  const load = useCallback(async () => {
    if (!userId) { setState((s) => ({ ...s, loading: false })); return; }
    const { data } = await supabase
      .from('gmail_connections')
      .select('bank_sync_alias, forwarding_enabled, last_received_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (data?.bank_sync_alias) { apply(data); return; }

    // No alias yet → provision one (RLS lets a user write their own row).
    const alias = newAlias();
    const { data: up } = await supabase
      .from('gmail_connections')
      .upsert({
        user_id: userId,
        bank_sync_alias: alias,
        forwarding_enabled: true,
        status: 'pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      .select('bank_sync_alias, forwarding_enabled, last_received_at')
      .single();
    apply(up ?? { bank_sync_alias: alias, forwarding_enabled: true, last_received_at: null });
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  /** Rotate the alias — the previous address stops working immediately. */
  const regenerate = useCallback(async () => {
    if (!userId) return;
    const alias = newAlias();
    const { data } = await supabase.from('gmail_connections')
      .update({
        bank_sync_alias: alias,
        forwarding_enabled: true,
        alias_rotated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('bank_sync_alias, forwarding_enabled, last_received_at')
      .single();
    apply(data ?? { bank_sync_alias: alias, forwarding_enabled: true, last_received_at: null });
  }, [userId]);

  /** Revoke (stop accepting forwarded mail) without deleting past data. */
  const setEnabled = useCallback(async (enabled: boolean) => {
    if (!userId) return;
    const { data } = await supabase.from('gmail_connections')
      .update({ forwarding_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select('bank_sync_alias, forwarding_enabled, last_received_at')
      .single();
    apply(data);
  }, [userId]);

  return { ...state, refresh: load, regenerate, setEnabled };
}
