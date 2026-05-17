import { useState, useEffect, useCallback } from 'react';
import { BankConnection } from '../types';
import { supabase } from '../utils/supabase';

interface Row {
  id: string;
  bank_id: string;
  bank_name: string;
  status: string;
  last_sync: string | null;
  transaction_count: number;
  error_message: string | null;
}

function rowToConnection(row: Row): BankConnection {
  return {
    id:               row.id,
    bankId:           row.bank_id,
    bankName:         row.bank_name,
    status:           (row.status as BankConnection['status']) ?? 'disconnected',
    lastSync:         row.last_sync ?? undefined,
    transactionCount: row.transaction_count ?? 0,
    errorMessage:     row.error_message ?? undefined,
  };
}

export function useBankConnections(userId: string) {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!userId) { setConnections([]); setLoading(false); return; }
    supabase
      .from('bank_connections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setConnections((data as Row[]).map(rowToConnection));
        setLoading(false);
      });
  }, [userId]);

  /** Insert or update a bank connection record. */
  const upsertConnection = useCallback(async (
    conn: Pick<BankConnection, 'bankId' | 'bankName' | 'status' | 'lastSync' | 'transactionCount' | 'errorMessage'>,
  ) => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('bank_connections')
      .upsert({
        user_id:           userId,
        bank_id:           conn.bankId,
        bank_name:         conn.bankName,
        status:            conn.status,
        last_sync:         conn.lastSync ?? null,
        transaction_count: conn.transactionCount,
        error_message:     conn.errorMessage ?? null,
        updated_at:        new Date().toISOString(),
      }, { onConflict: 'user_id,bank_id' })
      .select()
      .single();

    if (!error && data) {
      const updated = rowToConnection(data as Row);
      setConnections((prev) => {
        const idx = prev.findIndex((c) => c.bankId === conn.bankId);
        if (idx >= 0) return prev.map((c, i) => (i === idx ? updated : c));
        return [updated, ...prev];
      });
    }
  }, [userId]);

  /** Remove a bank connection (does not delete the imported transactions). */
  const removeConnection = useCallback(async (bankId: string) => {
    if (!userId) return;
    await supabase
      .from('bank_connections')
      .delete()
      .eq('user_id', userId)
      .eq('bank_id', bankId);
    setConnections((prev) => prev.filter((c) => c.bankId !== bankId));
  }, [userId]);

  return { connections, loading, upsertConnection, removeConnection };
}
