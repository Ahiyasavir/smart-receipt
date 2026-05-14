import { useState, useCallback } from 'react';
import { Receipt, ReceiptItem } from '../types';
import { loadReceipts, saveReceipt, deleteReceipt } from '../utils/storage';

export function useReceipts() {
  const [receipts, setReceipts] = useState<Receipt[]>(() => loadReceipts());

  const refresh = () => setReceipts(loadReceipts());

  const addReceipt = useCallback((receipt: Receipt) => {
    saveReceipt(receipt);
    setReceipts(loadReceipts());
  }, []);

  // Replace an entire receipt (used after bulk editing)
  const updateReceipt = useCallback((receipt: Receipt) => {
    saveReceipt(receipt);
    setReceipts(loadReceipts());
  }, []);

  // Update a single item inside a receipt and recompute the total
  const updateItem = useCallback((receiptId: string, item: ReceiptItem) => {
    const all = loadReceipts();
    const receipt = all.find((r) => r.id === receiptId);
    if (!receipt) return;
    receipt.items = receipt.items.map((i) => (i.id === item.id ? item : i));
    receipt.total = Math.round(
      receipt.items.reduce((sum, i) => sum + i.amount, 0) * 100,
    ) / 100;
    saveReceipt(receipt);
    setReceipts(loadReceipts());
  }, []);

  const removeReceipt = useCallback((id: string) => {
    deleteReceipt(id);
    setReceipts(loadReceipts());
  }, []);

  return { receipts, addReceipt, updateReceipt, updateItem, removeReceipt, refresh };
}
