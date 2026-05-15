import { useState, useEffect, useCallback } from 'react';
import { Receipt, ReceiptItem } from '../types';
import { supabase } from '../utils/supabase';

interface ReceiptRow {
  id: string;
  user_id: string;
  date: string;
  store_name: string;
  raw_text: string;
  items: ReceiptItem[];
  total: number;
  notes?: string | null;
  source?: string | null;
  external_id?: string | null;
}

function rowToReceipt(row: ReceiptRow): Receipt {
  return {
    id:         row.id,
    date:       row.date,
    storeName:  row.store_name,
    rawText:    row.raw_text,
    items:      row.items,
    total:      Number(row.total),
    notes:      row.notes ?? undefined,
    source:     (row.source as Receipt['source']) ?? undefined,
    externalId: row.external_id ?? undefined,
  };
}

export function useReceipts(userId: string) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!userId) { setReceipts([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from('receipts')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('receipts load:', error.message); }
        else { setReceipts((data as ReceiptRow[]).map(rowToReceipt)); }
        setLoading(false);
      });
  }, [userId]);

  const addReceipt = useCallback(async (receipt: Receipt) => {
    if (!userId) return;
    const { error } = await supabase.from('receipts').insert({
      id:         receipt.id,
      user_id:    userId,
      date:       receipt.date,
      store_name: receipt.storeName,
      raw_text:   receipt.rawText,
      items:      receipt.items,
      total:      receipt.total,
      notes:      receipt.notes ?? null,
    });
    if (error) { console.error('addReceipt:', error.message); return; }
    setReceipts((prev) => [receipt, ...prev]);
  }, [userId]);

  const updateReceipt = useCallback(async (receipt: Receipt) => {
    if (!userId) return;
    const { error } = await supabase.from('receipts').update({
      store_name: receipt.storeName,
      items:      receipt.items,
      total:      receipt.total,
      notes:      receipt.notes ?? null,
    }).eq('id', receipt.id).eq('user_id', userId);
    if (error) { console.error('updateReceipt:', error.message); return; }
    setReceipts((prev) => prev.map((r) => r.id === receipt.id ? receipt : r));
  }, [userId]);

  const updateItem = useCallback((receiptId: string, item: ReceiptItem) => {
    setReceipts((prev) => {
      const target = prev.find((r) => r.id === receiptId);
      if (!target) return prev;
      const items = target.items.map((i) => i.id === item.id ? item : i);
      const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
      const updated = { ...target, items, total };
      supabase.from('receipts').update({ items, total })
        .eq('id', receiptId).eq('user_id', userId)
        .then(({ error }) => { if (error) console.error('updateItem:', error.message); });
      return prev.map((r) => r.id === receiptId ? updated : r);
    });
  }, [userId]);

  const removeReceipt = useCallback(async (id: string) => {
    if (!userId) return;
    const { error } = await supabase.from('receipts').delete().eq('id', id).eq('user_id', userId);
    if (error) { console.error('removeReceipt:', error.message); return; }
    setReceipts((prev) => prev.filter((r) => r.id !== id));
  }, [userId]);

  return { receipts, loading, addReceipt, updateReceipt, updateItem, removeReceipt };
}
