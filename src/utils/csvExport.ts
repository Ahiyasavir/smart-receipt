import { Receipt } from '../types';
import { CATEGORY_META } from './categoryClassifier';

function esc(v: string | number) {
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export function exportReceiptsCsv(receipts: Receipt[]): void {
  const rows: string[] = [
    ['Date', 'Store', 'Item', 'Category', 'Amount', 'Notes'].join(','),
  ];

  for (const r of receipts) {
    const date  = new Date(r.date).toLocaleDateString();
    const notes = r.notes ?? '';
    if (r.items.length === 0) {
      rows.push([esc(date), esc(r.storeName), '', '', esc(r.total.toFixed(2)), esc(notes)].join(','));
    } else {
      for (const item of r.items) {
        const catLabel = CATEGORY_META[item.category]?.label ?? item.category;
        rows.push([
          esc(date),
          esc(r.storeName),
          esc(item.name),
          esc(catLabel),
          esc(item.amount.toFixed(2)),
          esc(notes),
        ].join(','));
      }
    }
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `spendora-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
