/**
 * BankBadge — source indicator for a receipt/transaction.
 *
 *  bank-sync   → "🏦 Bank"   indigo, subtle live pulse (auto-ingested)
 *  bank-import → "📂 Import"  purple (CSV)
 *  auto-synced detail variant → larger, on a colored header
 *
 * Returns null for OCR scans (no badge), so it's safe to drop in anywhere.
 */
import type { Receipt } from '../types';

interface Props {
  source: Receipt['source'];
  /** 'inline' (list rows) | 'header' (detail view on colored bg) */
  variant?: 'inline' | 'header';
}

export default function BankBadge({ source, variant = 'inline' }: Props) {
  if (source !== 'bank-sync' && source !== 'bank-import') return null;

  if (variant === 'header') {
    return (
      <span className="text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-full">
        {source === 'bank-sync' ? '🏦 Auto-synced' : '📂 Imported'}
      </span>
    );
  }

  if (source === 'bank-sync') {
    return (
      <span
        className="badge-sync-pulse text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full shrink-0"
        title="Automatically synced from your bank"
      >
        🏦 Bank
      </span>
    );
  }

  return (
    <span
      className="text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full shrink-0"
      title="Imported from a bank statement"
    >
      📂 Import
    </span>
  );
}
