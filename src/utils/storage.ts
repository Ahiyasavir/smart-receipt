import { Receipt } from '../types';

const STORAGE_KEY = 'receipt_scanner_v1';

export function loadReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Receipt[]) : [];
  } catch {
    return [];
  }
}

export function saveReceipt(receipt: Receipt): void {
  const all = loadReceipts();
  const idx = all.findIndex((r) => r.id === receipt.id);
  if (idx >= 0) {
    all[idx] = receipt;
  } else {
    all.unshift(receipt); // newest first
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteReceipt(id: string): void {
  const all = loadReceipts().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function clearAllReceipts(): void {
  localStorage.removeItem(STORAGE_KEY);
}
