import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';

/**
 * Read-only view of the user's Gmail connection. Deliberately selects ONLY
 * non-secret columns — the refresh_token is never fetched into the frontend.
 */
export interface GmailConnectionState {
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
}

export function useGmailConnection(userId: string) {
  const [state, setState]     = useState<GmailConnectionState>({
    connected: false, email: null, lastSyncedAt: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) { setState({ connected: false, email: null, lastSyncedAt: null }); setLoading(false); return; }
    const { data } = await supabase
      .from('gmail_connections')
      .select('email_address, status, last_synced_at')
      .eq('user_id', userId)
      .maybeSingle();
    setState({
      connected:    data?.status === 'connected',
      email:        data?.email_address ?? null,
      lastSyncedAt: data?.last_synced_at ?? null,
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { ...state, loading, refresh };
}
